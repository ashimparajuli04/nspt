import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { bech32 } from "@scure/base";
import { x25519 } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";
import {
  ed25519PubToMontgomery,
  sshPubB64ToRecipient,
  sshPubLineToRecipient,
  sshSeedToIdentity,
  sshIdentityFromFile,
  sshIdentityWithPassphrase,
} from "../core/ssh_to_age.js";
import { readOpenSshPrivateKey, decryptOpenSshPrivateKeyFile, wireToAuthorizedLine } from "../core/ssh_keys.js";
import { sealToFileKey, unsealFileKey } from "../core/age_keys.js";
import { generateKey } from "../core/enc_dec_file.js";

function sshString(s: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(s.length, 0);
  return Buffer.concat([len, s]);
}

function buildOpenSshKey(seed: Uint8Array, pub: Uint8Array, comment: string): string {
  const pubWire = Buffer.concat([
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(pub)),
  ]);
  const privWire = Buffer.concat([Buffer.from(seed), Buffer.from(pub)]);
  const checkint = Buffer.alloc(4);
  checkint.writeUInt32BE(0xabcd_ef01, 0);
  let privBlob = Buffer.concat([
    checkint,
    checkint,
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(pub)),
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

test("ed25519 -> Montgomery -> bech32 recipient matches x25519 public key", () => {
  const { seed, pub } = makeKeypair();
  const mont = ed25519PubToMontgomery(pub);
  assert.equal(mont.length, 32);
  const recipient = bech32.encodeFromBytes("age", mont);
  assert.ok(recipient.startsWith("age1"));

  // The Montgomery form must equal X25519's public key for the derived scalar.
  const scalar = sha512(seed).subarray(0, 32);
  assert.deepEqual(x25519.getPublicKey(scalar), mont);
});

test("openssh private key parses and identity matches seed derivation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-test-"));
  try {
    const { seed, pub } = makeKeypair();
    const file = path.join(dir, "id_ed25519");
    fs.writeFileSync(file, buildOpenSshKey(seed, pub, "test@example.com"));

    const parsed = readOpenSshPrivateKey(file);
    assert.ok(parsed, "should parse");
    assert.deepEqual(Buffer.from(parsed.seed!), Buffer.from(seed));
    assert.equal(parsed.comment, "test@example.com");

    const ident = sshIdentityFromFile(file);
    assert.ok(ident);
    assert.equal(ident.identity, sshSeedToIdentity(seed));
    assert.ok(ident.identity.startsWith("AGE-SECRET-KEY-1"));

    // pubLine round-trips back to the same recipient
    assert.equal(sshPubLineToRecipient(ident.pubLine), ident.recipient);
    const wire = Buffer.from(ident.pubLine.trim().split(/\s+/)[1]!, "base64");
    assert.equal(wireToAuthorizedLine(new Uint8Array(wire)), ident.pubLine);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ssh key to age: full seal/unseal round trip (the add->sync path)", async () => {
  const { seed, pub } = makeKeypair();
  const pubWire = Buffer.concat([
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(pub)),
  ]);
  const recipient = sshPubB64ToRecipient(pubWire.toString("base64"));
  assert.ok(recipient);

  const fileKeyHex = generateKey();
  const wrapped = (await sealToFileKey(fileKeyHex, [recipient]))[0]!;
  assert.ok(wrapped);

  const identity = sshSeedToIdentity(seed);
  const unsealed = await unsealFileKey(wrapped, identity);
  assert.equal(unsealed, fileKeyHex);
});

test("a different ssh key cannot unseal", async () => {
  const alice = makeKeypair();
  const bob = makeKeypair();
  const alicePubWire = Buffer.concat([
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(alice.pub)),
  ]);
  const recipient = sshPubB64ToRecipient(alicePubWire.toString("base64"))!;

  const fileKeyHex = generateKey();
  const wrapped = (await sealToFileKey(fileKeyHex, [recipient]))[0]!;

  const bobIdentity = sshSeedToIdentity(bob.seed);
  assert.equal(await unsealFileKey(wrapped, bobIdentity), null);
  assert.equal(await unsealFileKey(wrapped, sshSeedToIdentity(alice.seed)), fileKeyHex);
});

test("parses a real ssh-keygen-produced key", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-test-"));
  const file = path.join(dir, "id_ed25519");
  try {
    execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", "test@example.com", "-f", file]);
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    t.skip("ssh-keygen not available");
    return;
  }
  try {
    const parsed = readOpenSshPrivateKey(file);
    assert.ok(parsed, "should parse real ssh-keygen key");
    assert.equal(parsed.comment, "test@example.com");

    const ident = sshIdentityFromFile(file);
    assert.ok(ident);

    // round trip through the real key
    const recipient = sshPubB64ToRecipient(
      fs.readFileSync(file + ".pub", "utf8").trim().split(/\s+/)[1]!
    );
    assert.equal(recipient, ident.recipient);

    const fileKeyHex = generateKey();
    const wrapped = (await sealToFileKey(fileKeyHex, [recipient]))[0]!;
    assert.equal(await unsealFileKey(wrapped, ident.identity), fileKeyHex);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("non-openssh / non-ed25519 inputs are rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-test-"));
  try {
    const file = path.join(dir, "not_openssh");
    fs.writeFileSync(file, "-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n");
    assert.equal(readOpenSshPrivateKey(file), null);
    assert.equal(sshPubLineToRecipient("ssh-rsa AAAA1234"), null);
    assert.equal(sshPubLineToRecipient("not-a-key"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeEncryptedKey(t: { skip: (msg: string) => void }, dir: string, file: string): boolean {
  try {
    execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "s3cret", "-C", "test@example.com", "-f", file]);
    return true;
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    t.skip("ssh-keygen not available");
    return false;
  }
}

test("passphrase-protected key: decryptOpenSshPrivateKeyFile recovers the seed", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-test-"));
  const file = path.join(dir, "id_ed25519");
  if (!makeEncryptedKey(t, dir, file)) return;
  try {
    const parsed = readOpenSshPrivateKey(file);
    assert.ok(parsed, "should parse encrypted key");
    assert.equal(parsed.encrypted, true);

    assert.equal(decryptOpenSshPrivateKeyFile(file, "wrong-pass"), null, "wrong passphrase");

    const decrypted = decryptOpenSshPrivateKeyFile(file, "s3cret");
    assert.ok(decrypted, "correct passphrase should decrypt");
    assert.equal(decrypted.encrypted, false);
    assert.ok(decrypted.seed, "seed should be recovered");
    assert.equal(decrypted.seed.length, 32);
    assert.ok(sshSeedToIdentity(decrypted.seed).startsWith("AGE-SECRET-KEY-1"));

    const ident = sshIdentityWithPassphrase(file, "s3cret");
    assert.ok(ident, "sshIdentityWithPassphrase should unlock");
    assert.equal(ident.identity, sshSeedToIdentity(decrypted.seed!));
    assert.equal(sshIdentityWithPassphrase(file, "wrong-pass"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("passphrase-protected key: full seal/unseal round trip", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-test-"));
  const file = path.join(dir, "id_ed25519");
  if (!makeEncryptedKey(t, dir, file)) return;
  try {
    const id = sshIdentityWithPassphrase(file, "s3cret");
    assert.ok(id);

    const recipient = sshPubB64ToRecipient(
      fs.readFileSync(file + ".pub", "utf8").trim().split(/\s+/)[1]!
    );
    assert.equal(recipient, id.recipient);

    const fileKeyHex = generateKey();
    const wrapped = (await sealToFileKey(fileKeyHex, [recipient]))[0]!;
    assert.equal(await unsealFileKey(wrapped, id.identity), fileKeyHex);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
