import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import * as toml from "smol-toml";
import * as fs from "node:fs";
import * as path from "node:path";
import { isPathWithinRoot } from "./files.js";

export function generateKey() {
  const key = randomBytes(32);
  return key.toString("hex");
}

export function encryptAllTrackedFiles(key: string, groupName: string) {
  const keyBuffer = Buffer.from(key, "hex");
  const raw = fs.readFileSync(path.join(process.cwd(), "nspt", groupName, "config.toml"), "utf-8");
  const config = toml.parse(raw) as { files: { name: string; path: string }[] };
  for (const file of config.files) {
    encryptFile(keyBuffer, groupName, file);
  }
}

export function encryptFile(key: Buffer, groupName: string, file: { name: string; path: string }) {
  if (!isPathWithinRoot(file.path)) {
    throw new Error(`Path "${file.path}" is outside the repo root and can't be encrypted`);
  }
  let plaintext: Buffer;
  try {
    plaintext = fs.readFileSync(file.path);
  } catch {
    throw new Error(`Could not read "${file.name}" at ${file.path}`);
  }
  const outPath = path.join(process.cwd(), "nspt", groupName, "encfiles", `${file.name}.enc`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encryptBytes(key, plaintext));
}

export function decryptAllFiles(key: string, groupName: string) {
  const keyBuffer = Buffer.from(key, "hex");
  const encDir = path.join(process.cwd(), "nspt", groupName, "encfiles");
  const raw = fs.readFileSync(path.join(process.cwd(), "nspt", groupName, "config.toml"), "utf-8");
  const config = toml.parse(raw) as { files: { name: string; path: string }[] };

  const encNames = fs
    .readdirSync(encDir)
    .filter((name) => name.endsWith(".enc"))
    .map((name) => name.replace(/\.enc$/, ""));

  for (const name of encNames) {
    const file = config.files.find((entry) => entry.name === name);
    if (!file) {
      throw new Error(`No config entry for encrypted file "${name}" in "${groupName}"`);
    }
    decryptFile(keyBuffer, groupName, file);
  }
}

export function decryptFile(key: Buffer, groupName: string, file: { name: string; path: string }) {
  if (!isPathWithinRoot(file.path)) {
    throw new Error(`Path "${file.path}" is outside the repo root and can't be decrypted to`);
  }
  const encPath = path.join(process.cwd(), "nspt", groupName, "encfiles", `${file.name}.enc`);
  let data: Buffer;
  try {
    data = fs.readFileSync(encPath);
  } catch {
    throw new Error(`Could not read encrypted file "${file.name}" at ${encPath}`);
  }
  let restored: Buffer;
  try {
    restored = decryptBytes(key, data);
  } catch {
    throw new Error(`Decryption failed for "${file.name}" — wrong key or corrupted encrypted file`);
  }
  fs.writeFileSync(file.path, restored);
}

export function rotateEncryptedFiles(oldKey: string, newKey: string, groupName: string) {
  const oldKeyBuffer = Buffer.from(oldKey, "hex");
  const newKeyBuffer = Buffer.from(newKey, "hex");
  const raw = fs.readFileSync(path.join(process.cwd(), "nspt", groupName, "config.toml"), "utf-8");
  const config = toml.parse(raw) as { files: { name: string; path: string }[] };

  for (const file of config.files) {
    const encPath = path.join(process.cwd(), "nspt", groupName, "encfiles", `${file.name}.enc`);
    let data: Buffer;
    try {
      data = fs.readFileSync(encPath);
    } catch {
      continue;
    }
    const plaintext = decryptBytes(oldKeyBuffer, data);
    fs.writeFileSync(encPath, encryptBytes(newKeyBuffer, plaintext));
  }
}

function encryptBytes(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

function decryptBytes(key: Buffer, data: Buffer): Buffer {
  const decIv = data.subarray(0, 12);
  const decTag = data.subarray(12, 28);
  const decCiphertext = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, decIv);
  decipher.setAuthTag(decTag);
  return Buffer.concat([decipher.update(decCiphertext), decipher.final()]);
}
