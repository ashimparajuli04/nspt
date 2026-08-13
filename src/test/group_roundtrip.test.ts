import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { generateKey } from "../core/enc_dec_file.js";
import { sealToFileKey } from "../core/age_keys.js";
import { sshSeedToIdentity, sshPubB64ToRecipient } from "../core/ssh_to_age.js";
import { writeUserKeys, readUserKeys } from "../core/user_keys.js";
import { unwrapGroupKey, verifyGroupMembership } from "../core/unwrap.js";
import type { UserKeysFile } from "../types.js";

const prevCwd = process.cwd();

function sshString(s: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(s.length, 0);
  return Buffer.concat([len, s]);
}

function makeKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "jwk" },
    privateKeyEncoding: { type: "pkcs8", format: "jwk" },
  });
  const b64u = (s: string | undefined) => Buffer.from(s ?? "", "base64url");
  return { seed: b64u(privateKey.d), pub: b64u(publicKey.x) };
}

function pubB64(pub: Uint8Array): string {
  return Buffer.concat([sshString(Buffer.from("ssh-ed25519")), sshString(Buffer.from(pub))]).toString("base64");
}

test("group round trip: ssh identity -> user_keys.toml -> unwrapGroupKey", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-group-"));
  process.chdir(dir);
  try {
    const groupName = "grp";
    const groupPath = path.join(dir, "nspt", groupName);
    fs.mkdirSync(path.join(groupPath, "encfiles"), { recursive: true });

    const { seed, pub } = makeKeypair();
    const identity = sshSeedToIdentity(seed);
    const recipient = sshPubB64ToRecipient(pubB64(pub))!;
    const fileKeyHex = generateKey();

    const wrapped = (await sealToFileKey(fileKeyHex, [recipient]))[0]!;

    const data: UserKeysFile = {
      key_version: 1,
      users: [{ username: "alice", keys: [{ age: recipient, ssh: `ssh-ed25519 ${pubB64(pub)}`, wrapped }] }],
    };
    writeUserKeys(groupPath, data);

    const unwrapped = await unwrapGroupKey(groupName, { identities: [identity] });
    assert.equal(unwrapped, fileKeyHex);

    assert.equal(await verifyGroupMembership(groupName, { identities: [identity] }), true);
    assert.equal(await verifyGroupMembership(groupName, { identities: [sshSeedToIdentity(makeKeypair().seed)] }), false);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unwrapGroupKey: returns null when identity cannot unseal any wrap", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-group-"));
  process.chdir(dir);
  try {
    const groupName = "grp";
    const groupPath = path.join(dir, "nspt", groupName);
    fs.mkdirSync(path.join(groupPath, "encfiles"), { recursive: true });

    const alice = makeKeypair();
    const bob = makeKeypair();
    const recipient = sshPubB64ToRecipient(pubB64(alice.pub))!;
    const fileKeyHex = generateKey();
    const wrapped = (await sealToFileKey(fileKeyHex, [recipient]))[0]!;

    writeUserKeys(groupPath, {
      key_version: 1,
      users: [{ username: "alice", keys: [{ age: recipient, ssh: "ssh-ed25519 alice", wrapped }] }],
    });

    assert.equal(await unwrapGroupKey(groupName, { identities: [sshSeedToIdentity(bob.seed)] }), null);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});