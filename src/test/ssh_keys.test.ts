import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  parseOpenSshPrivateKey,
  readOpenSshPrivateKey,
  discoverLocalKeys,
  findLocalKeyForPublicKey,
  findEncryptedLocalKeys,
  sshWireString,
} from "../core/ssh_keys.js";

function sshString(s: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(s.length, 0);
  return Buffer.concat([len, s]);
}

function buildOpenSshKey(
  seed: Uint8Array,
  pub: Uint8Array,
  comment: string,
  opts: { innerPub?: Uint8Array; privTail?: Uint8Array } = {}
): string {
  const pubWire = Buffer.concat([
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(pub)),
  ]);
  const privWire = Buffer.concat([Buffer.from(seed), Buffer.from(opts.privTail ?? pub)]);
  const checkint = Buffer.alloc(4);
  checkint.writeUInt32BE(0xabcd_ef01, 0);
  let privBlob = Buffer.concat([
    checkint,
    checkint,
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(opts.innerPub ?? pub)),
    sshString(privWire),
    sshString(Buffer.from(comment)),
  ]);
  const pad = (8 - (privBlob.length % 8)) % 8;
  if (pad > 0) {
    const pb = Buffer.alloc(pad);
    for (let i = 0; i < pad; i++) pb[i] = i + 1;
    privBlob = Buffer.concat([privBlob, pb]);
  }
  const nkeys = Buffer.alloc(4);
  nkeys.writeUInt32BE(1, 0);
  const body = Buffer.concat([
    Buffer.from("openssh-key-v1\0"),
    sshString(Buffer.from("none")),
    sshString(Buffer.from("none")),
    sshString(Buffer.alloc(0)),
    nkeys,
    sshString(pubWire),
    sshString(privBlob),
  ]);
  const b64 = body.toString("base64").replace(/(.{1,70})/g, "$1\n");
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}-----END OPENSSH PRIVATE KEY-----\n`;
}

function makeKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "jwk" },
    privateKeyEncoding: { type: "pkcs8", format: "jwk" },
  });
  const b64u = (s: string | undefined) => Buffer.from(s ?? "", "base64url");
  return {
    seed: b64u(privateKey.d),
    pub: b64u(publicKey.x),
  };
}

function makeSshDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nspt-ssh-"));
}

function hasKeygen(): boolean {
  const res = spawnSync("ssh-keygen", [], { stdio: "ignore" });
  return !res.error;
}

function pubLineOf(pub: Uint8Array): string {
  return `ssh-ed25519 ${sshWireString("ssh-ed25519", pub).toString("base64")}`;
}

test("parse: unencrypted key yields seed, embedded pub and comment", () => {
  const { seed, pub } = makeKeypair();
  const parsed = parseOpenSshPrivateKey(buildOpenSshKey(seed, pub, "test@example.com"));
  assert.ok(parsed);
  assert.equal(parsed.encrypted, false);
  assert.deepEqual(Buffer.from(parsed.seed!), Buffer.from(seed));
  assert.deepEqual(Buffer.from(parsed.pubBytes), Buffer.from(pub));
  assert.equal(parsed.comment, "test@example.com");
});

test("parse: strict armor header validation", () => {
  const { seed, pub } = makeKeypair();
  const good = buildOpenSshKey(seed, pub, "c");

  const missingEnd = good.replace("-----END OPENSSH PRIVATE KEY-----", "-----END RSA PRIVATE KEY-----");
  assert.equal(parseOpenSshPrivateKey(missingEnd), null);

  const missingBegin = good.replace("-----BEGIN OPENSSH PRIVATE KEY-----", "-----BEGIN OPENSSH PRIVATE KEY----");
  assert.equal(parseOpenSshPrivateKey(missingBegin), null);

  assert.equal(parseOpenSshPrivateKey(""), null);

  // CRLF line endings are tolerated
  const crlf = good.replace(/\n/g, "\r\n");
  assert.ok(parseOpenSshPrivateKey(crlf));
});

test("parse: inner/outer public key mismatch is rejected", () => {
  const { seed, pub } = makeKeypair();
  const other = makeKeypair();
  assert.equal(parseOpenSshPrivateKey(buildOpenSshKey(seed, pub, "c", { innerPub: other.pub })), null);
});

test("parse: private section public-key tail mismatch is rejected", () => {
  const { seed, pub } = makeKeypair();
  const other = makeKeypair();
  assert.equal(parseOpenSshPrivateKey(buildOpenSshKey(seed, pub, "c", { privTail: other.pub })), null);
});

test("parse: PEM RSA and non-key files are rejected", () => {
  assert.equal(
    parseOpenSshPrivateKey("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n"),
    null
  );
  assert.equal(parseOpenSshPrivateKey("not a key at all"), null);
});

test("parse: encrypted key exposes public half without the passphrase", (t) => {
  if (!hasKeygen()) {
    t.skip("ssh-keygen not available");
    return;
  }
  const dir = makeSshDir();
  const file = path.join(dir, "id_ed25519");
  try {
    execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "s3cret", "-C", "enc", "-f", file]);
    const parsed = readOpenSshPrivateKey(file);
    assert.ok(parsed, "encrypted key should still parse");
    assert.equal(parsed.encrypted, true);
    assert.equal(parsed.seed, null);
    assert.equal(parsed.cipher, "aes256-ctr");
    assert.equal(parsed.kdf, "bcrypt");

    // the embedded public key matches the .pub sidecar, no decryption needed
    const pubFile = fs.readFileSync(file + ".pub", "utf8").trim().split(/\s+/)[1]!;
    const pubWire = Buffer.from(pubFile, "base64");
    assert.deepEqual(Buffer.from(parsed.pubWire), Buffer.from(pubWire));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discover: finds keys regardless of filename and without a .pub sidecar", async () => {
  const dir = makeSshDir();
  try {
    const { seed, pub } = makeKeypair();
    fs.writeFileSync(path.join(dir, "github_deploy_key"), buildOpenSshKey(seed, pub, "deploy"));
    const keys = await discoverLocalKeys(dir);
    assert.equal(keys.length, 1);
    assert.equal(keys[0]!.type, "ssh-ed25519");
    assert.equal(keys[0]!.hasPrivate, true);
    assert.equal(keys[0]!.source, path.join(dir, "github_deploy_key"));
    assert.deepEqual(Buffer.from(keys[0]!.pubBytes!), Buffer.from(pub));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discover: a .pub without its private half is not reported as present", async () => {
  const dir = makeSshDir();
  try {
    const { pub } = makeKeypair();
    fs.writeFileSync(path.join(dir, "id_ed25519.pub"), pubLineOf(pub) + "\n");
    const keys = await discoverLocalKeys(dir);
    assert.deepEqual(keys, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("findLocalKeyForPublicKey: matches a real ssh-keygen key by bytes", async (t) => {
  if (!hasKeygen()) {
    t.skip("ssh-keygen not available");
    return;
  }
  const dir = makeSshDir();
  const file = path.join(dir, "id_ed25519");
  try {
    execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", "match", "-f", file]);
    const pubLine = fs.readFileSync(file + ".pub", "utf8").trim();
    const match = await findLocalKeyForPublicKey(pubLine, dir);
    assert.ok(match, "should detect the local private key");
    assert.equal(match!.encrypted, false);

    const other = makeKeypair();
    assert.equal(await findLocalKeyForPublicKey(pubLineOf(other.pub), dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("findLocalKeyForPublicKey: detects encrypted keys without the passphrase", async (t) => {
  if (!hasKeygen()) {
    t.skip("ssh-keygen not available");
    return;
  }
  const dir = makeSshDir();
  const file = path.join(dir, "id_ed25519");
  try {
    execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "hunter2", "-C", "locked", "-f", file]);
    const pubLine = fs.readFileSync(file + ".pub", "utf8").trim();
    const match = await findLocalKeyForPublicKey(pubLine, dir);
    assert.ok(match, "possession should be detectable for encrypted keys");
    assert.equal(match!.encrypted, true);

    const encrypted = await findEncryptedLocalKeys(dir);
    assert.equal(encrypted.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
