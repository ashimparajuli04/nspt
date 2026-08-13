import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  generateKey,
  encryptFile,
  encryptAllTrackedFiles,
  decryptFile,
  decryptAllFiles,
  readDecryptedFile,
  rotateEncryptedFiles,
} from "../core/enc_dec_file.js";
import { createFolder, createGroupConfig, addFileToGroupConfig } from "../core/files.js";

const prevCwd = process.cwd();

async function inTempRepo<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-enc-"));
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function setupGroup(groupName = "grp"): string {
  const groupPath = path.join(process.cwd(), "nspt", groupName);
  createFolder(groupPath);
  createGroupConfig(groupPath, groupName);
  fs.mkdirSync(path.join(groupPath, "encfiles"), { recursive: true });
  return groupName;
}

const ENV1 = { name: "env-prod-b26af0b1", path: "./.env.prod" };

test("generateKey: returns 64 hex characters, unique per call", () => {
  const a = generateKey();
  const b = generateKey();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.match(b, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("encryptFile/decryptFile: round trip restores the original bytes", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    fs.writeFileSync(ENV1.path, "SECRET=value\n");
    const key = generateKey();
    encryptFile(Buffer.from(key, "hex"), group, ENV1);
    const encPath = path.join(process.cwd(), "nspt", group, "encfiles", `${ENV1.name}.enc`);
    assert.ok(fs.existsSync(encPath));
    assert.notEqual(fs.readFileSync(encPath).toString(), "SECRET=value\n");

    decryptFile(Buffer.from(key, "hex"), group, ENV1);
    assert.equal(fs.readFileSync(ENV1.path, "utf8"), "SECRET=value\n");
  });
});

test("readDecryptedFile: returns plaintext without touching the tracked file", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    fs.writeFileSync(ENV1.path, "TOKEN=abc123\n");
    const key = generateKey();
    encryptFile(Buffer.from(key, "hex"), group, ENV1);
    assert.equal(readDecryptedFile(key, group, ENV1), "TOKEN=abc123\n");
    assert.equal(fs.readFileSync(ENV1.path, "utf8"), "TOKEN=abc123\n");
  });
});

test("decryptFile: wrong key or corrupted data throws", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    fs.writeFileSync(ENV1.path, "SECRET=value\n");
    const key = generateKey();
    encryptFile(Buffer.from(key, "hex"), group, ENV1);

    assert.throws(() => decryptFile(Buffer.from(generateKey(), "hex"), group, ENV1), /wrong key/i);

    fs.writeFileSync(
      path.join(process.cwd(), "nspt", group, "encfiles", `${ENV1.name}.enc`),
      "garbage"
    );
    assert.throws(() => decryptFile(Buffer.from(key, "hex"), group, ENV1), /decryption failed/i);
  });
});

test("encryptFile: refuses paths outside the repo root", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    fs.writeFileSync(path.join(os.tmpdir(), "nspt-outside-secret"), "nope");
    assert.throws(
      () =>
        encryptFile(Buffer.from(generateKey(), "hex"), group, {
          name: "outside",
          path: path.join(os.tmpdir(), "nspt-outside-secret"),
        }),
      /outside the repo root/
    );
    assert.throws(
      () =>
        decryptFile(Buffer.from(generateKey(), "hex"), group, {
          name: "outside",
          path: path.join(os.tmpdir(), "nspt-outside-secret"),
        }),
      /outside the repo root/
    );
  });
});

test("encryptFile: missing source file throws", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    assert.throws(
      () => encryptFile(Buffer.from(generateKey(), "hex"), group, { name: "ghost", path: "./ghost.env" }),
      /could not read/i
    );
  });
});

test("encryptAllTrackedFiles/decryptAllFiles: handles every file in config", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    const env2 = { name: "src-env-9eabb446", path: "./src/.env" };
    fs.mkdirSync(path.dirname(env2.path), { recursive: true });
    fs.writeFileSync(ENV1.path, "A=1\n");
    fs.writeFileSync(env2.path, "B=2\n");
    addFileToGroupConfig(group, ENV1);
    addFileToGroupConfig(group, env2);

    const key = generateKey();
    encryptAllTrackedFiles(key, group);
    const encDir = path.join(process.cwd(), "nspt", group, "encfiles");
    assert.deepEqual(
      fs.readdirSync(encDir).sort(),
      ["env-prod-b26af0b1.enc", "src-env-9eabb446.enc"]
    );

    fs.writeFileSync(ENV1.path, "tampered");
    fs.writeFileSync(env2.path, "tampered");
    decryptAllFiles(key, group);
    assert.equal(fs.readFileSync(ENV1.path, "utf8"), "A=1\n");
    assert.equal(fs.readFileSync(env2.path, "utf8"), "B=2\n");
  });
});

test("decryptAllFiles: throws when an .enc has no config entry", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    fs.writeFileSync(ENV1.path, "A=1\n");
    addFileToGroupConfig(group, ENV1);
    const key = generateKey();
    encryptFile(Buffer.from(key, "hex"), group, ENV1);

    encryptFile(Buffer.from(key, "hex"), group, { name: "orphan", path: ENV1.path });
    assert.throws(() => decryptAllFiles(key, group), /no config entry/i);
  });
});

test("rotateEncryptedFiles: old key stops working, new key decrypts", async () => {
  await inTempRepo(() => {
    const group = setupGroup();
    fs.writeFileSync(ENV1.path, "SECRET=value\n");
    addFileToGroupConfig(group, ENV1);
    const oldKey = generateKey();
    const newKey = generateKey();
    encryptFile(Buffer.from(oldKey, "hex"), group, ENV1);

    rotateEncryptedFiles(oldKey, newKey, group);
    assert.throws(() => decryptFile(Buffer.from(oldKey, "hex"), group, ENV1), /wrong key/i);
    decryptFile(Buffer.from(newKey, "hex"), group, ENV1);
    assert.equal(fs.readFileSync(ENV1.path, "utf8"), "SECRET=value\n");
  });
});