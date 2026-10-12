import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { sshPubB64ToRecipient } from "../core/ssh_to_age.js";
import { writeUserKeys } from "../core/user_keys.js";
import { isGroupMember } from "../core/unwrap.js";
import type { UserKeysFile } from "../types.js";

const prevCwd = process.cwd();

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
  return { seed: b64u(privateKey.d), pub: b64u(publicKey.x) };
}

function sshWire(pub: Uint8Array): string {
  return Buffer.concat([
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(pub)),
  ]).toString("base64");
}

function pubLineOf(pub: Uint8Array): string {
  return `ssh-ed25519 ${sshWire(pub)}`;
}

test("isGroupMember: true only when a local SSH key belongs to the group", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-mem-repo-"));
  const sshDir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-mem-ssh-"));
  process.chdir(repo);
  try {
    const groupPath = path.join(repo, "nspt", "grp");
    fs.mkdirSync(path.join(groupPath, "encfiles"), { recursive: true });

    const alice = makeKeypair();
    const bob = makeKeypair();
    const recipient = sshPubB64ToRecipient(sshWire(alice.pub))!;

    const data: UserKeysFile = {
      key_version: 1,
      users: [
        {
          username: "alice",
          keys: [{ age: recipient, ssh: pubLineOf(alice.pub), wrapped: "unused" }],
        },
      ],
    };
    writeUserKeys(groupPath, data);

    assert.equal(await isGroupMember("grp", { sshDir }), false, "no local key yet");

    fs.writeFileSync(path.join(sshDir, "id_ed25519"), buildOpenSshKey(bob.seed, bob.pub, "bob"));
    assert.equal(await isGroupMember("grp", { sshDir }), false, "bob is not a member");

    fs.writeFileSync(path.join(sshDir, "id_ed25519"), buildOpenSshKey(alice.seed, alice.pub, "alice"));
    assert.equal(await isGroupMember("grp", { sshDir }), true, "alice is a member");
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(sshDir, { recursive: true, force: true });
  }
});
