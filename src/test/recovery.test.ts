import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { generateKey, encryptFile } from "../core/enc_dec_file.js";
import { sealToFileKey, sealToPassphrase, unsealWithPassphrase } from "../core/age_keys.js";
import { sshSeedToIdentity, sshPubB64ToRecipient } from "../core/ssh_to_age.js";
import { writeUserKeys } from "../core/user_keys.js";
import { unwrapGroupKeyDetailed } from "../core/unwrap.js";
import {
  validateRecoveryPassword,
  readRecoveryFile,
  writeRecoveryFile,
  fingerprintFileKey,
  readRecoveryConfig,
  setStoredPassword,
} from "../core/recovery.js";
import type { UserKeysFile } from "../types.js";

const prevCwd = process.cwd();
const PASSWORD = "Sup3rSecret!";

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
  return Buffer.concat([
    sshString(Buffer.from("ssh-ed25519")),
    sshString(Buffer.from(pub)),
  ]).toString("base64");
}

interface Fixture {
  dir: string;
  groupPath: string;
  groupName: string;
  identity: string;
  recipient: string;
  fileKey: string;
}

function setupGroup(): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-recovery-"));
  const groupName = "grp";
  const groupPath = path.join(dir, "nspt", groupName);
  fs.mkdirSync(path.join(groupPath, "encfiles"), { recursive: true });

  const { seed, pub } = makeKeypair();
  const identity = sshSeedToIdentity(seed);
  const recipient = sshPubB64ToRecipient(pubB64(pub))!;
  const fileKey = generateKey();

  return { dir, groupPath, groupName, identity, recipient, fileKey };
}

async function writeAlice(fx: Fixture, fileKey = fx.fileKey): Promise<void> {
  const wrapped = (await sealToFileKey(fileKey, [fx.recipient]))[0]!;
  const data: UserKeysFile = {
    key_version: 1,
    users: [
      {
        username: "alice",
        keys: [{ age: fx.recipient, ssh: `ssh-ed25519 ${pubB64(Buffer.alloc(0))}`, wrapped }],
      },
    ],
  };
  writeUserKeys(fx.groupPath, data);
}

/** Point the machine-local store at a scratch file so tests stay hermetic. */
function useScratchConfig(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-recovery-config-"));
  const configPath = path.join(dir, "recovery.json");
  process.env["NSPT_RECOVERY_CONFIG"] = configPath;
  return configPath;
}

async function withGroup(run: (fx: Fixture) => Promise<void>): Promise<void> {
  const fx = setupGroup();
  const configPath = useScratchConfig();
  process.chdir(fx.dir);
  try {
    await run(fx);
  } finally {
    process.chdir(prevCwd);
    delete process.env["NSPT_RECOVERY_CONFIG"];
    fs.rmSync(fx.dir, { recursive: true, force: true });
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  }
}

test("passphrase wrap round trips, and a wrong password returns null", async () => {
  const fileKey = generateKey();
  const armored = await sealToPassphrase(fileKey, PASSWORD);
  assert.equal(await unsealWithPassphrase(armored, PASSWORD), fileKey);
  assert.equal(await unsealWithPassphrase(armored, "WrongPassw0rd!"), null);
});

test("validateRecoveryPassword enforces the class rules", () => {
  assert.equal(validateRecoveryPassword(PASSWORD).ok, true);
  assert.equal(validateRecoveryPassword("Ab1!abc").ok, false); // too short
  assert.equal(validateRecoveryPassword("abcdefg1!").ok, false); // no uppercase
  assert.equal(validateRecoveryPassword("ABCDEFG1!").ok, false); // no lowercase
  assert.equal(validateRecoveryPassword("Abcdefg!!").ok, false); // no digit
  assert.equal(validateRecoveryPassword("Abcdefg11").ok, false); // no special
  assert.equal(validateRecoveryPassword("Abc 1!def").ok, false); // whitespace
  assert.equal(validateRecoveryPassword("Aa1!" + "x".repeat(27)).ok, false); // too long
});

test("a key-based unwrap auto-arms a recovery entry that then unlocks the group", async () => {
  await withGroup(async (fx) => {
    await writeAlice(fx);
    setStoredPassword(PASSWORD);

    const viaKey = await unwrapGroupKeyDetailed(fx.groupName, {
      identities: [fx.identity],
      storedPassword: PASSWORD,
      allowRecoveryWrite: true,
    });
    assert.equal(viaKey?.method, "identity");
    assert.equal(viaKey?.username, "alice");

    const file = readRecoveryFile(fx.groupPath);
    assert.equal(file.entries.length, 1);
    assert.equal(file.entries[0]!.username, "alice");
    assert.equal(file.entries[0]!.fingerprint, fingerprintFileKey(fx.fileKey));

    // Registry recorded so password changes can warn about other repos.
    const config = readRecoveryConfig();
    assert.ok(config);
    assert.equal(config!.repos.length, 1);
    assert.deepEqual(config!.repos[0]!.groups, [fx.groupName]);

    // Now a machine with no keys at all, but the password.
    const viaPassword = await unwrapGroupKeyDetailed(fx.groupName, {
      identities: [],
      storedPassword: PASSWORD,
    });
    assert.equal(viaPassword?.method, "recovery");
    assert.equal(viaPassword?.fileKey, fx.fileKey);
  });
});

test("without allowRecoveryWrite nothing is committed", async () => {
  await withGroup(async (fx) => {
    await writeAlice(fx);
    const result = await unwrapGroupKeyDetailed(fx.groupName, {
      identities: [fx.identity],
      storedPassword: PASSWORD,
    });
    assert.equal(result?.method, "identity");
    assert.equal(readRecoveryFile(fx.groupPath).entries.length, 0);
  });
});

test("a recovery wrap created before a rotation is ignored as stale", async () => {
  await withGroup(async (fx) => {
    // Current key is on file and opens the tracked file.
    fs.writeFileSync(path.join(fx.dir, ".env"), "SECRET=current\n");
    fs.writeFileSync(
      path.join(fx.groupPath, "config.toml"),
      '[[files]]\nname = "x"\npath = "./.env"\n'
    );
    encryptFile(Buffer.from(fx.fileKey, "hex"), fx.groupName, { name: "x", path: "./.env" });
    await writeAlice(fx);

    // A stale entry holding a pre-rotation key.
    const oldKey = generateKey();
    const staleWrapped = await sealToPassphrase(oldKey, PASSWORD);
    writeRecoveryFile(fx.groupPath, {
      version: 1,
      entries: [{ username: "alice", fingerprint: fingerprintFileKey(oldKey), wrapped: staleWrapped }],
    });

    // Password-only must not hand back the dead key.
    const viaPassword = await unwrapGroupKeyDetailed(fx.groupName, {
      identities: [],
      storedPassword: PASSWORD,
    });
    assert.equal(viaPassword, null);

    // A key still works, and re-arms the entry with the current key.
    const viaKey = await unwrapGroupKeyDetailed(fx.groupName, {
      identities: [fx.identity],
      storedPassword: PASSWORD,
      allowRecoveryWrite: true,
    });
    assert.equal(viaKey?.fileKey, fx.fileKey);
    assert.equal(
      readRecoveryFile(fx.groupPath).entries[0]!.fingerprint,
      fingerprintFileKey(fx.fileKey)
    );
  });
});
