import * as path from "node:path";
import { loadIdentity } from "./age_store.js";
import { unsealFileKey, sealToPassphrase, unsealWithPassphrase } from "./age_keys.js";
import { fileKeyLooksValid } from "./enc_dec_file.js";
import { readUserKeys } from "./user_keys.js";
import { discoverLocalKeys, findEncryptedLocalKeys } from "./ssh_keys.js";
import { findLocalSshIdentities, sshIdentityWithPassphrase, sshPubLineToRecipient } from "./ssh_to_age.js";
import {
  findRecoveryEntry,
  fingerprintFileKey,
  getStoredPassword,
  getStoredUsername,
  readRecoveryFile,
  recordRepoUsage,
  upsertRecoveryEntry,
  writeRecoveryFile,
} from "./recovery.js";

export interface UnwrapOptions {
  getPassphrase?: (keyPath: string) => Promise<string | null>;
  /** Last-resort prompt shown only after stored passwords and keys both fail. */
  getRecoveryPassword?: () => Promise<string | null>;
  /** Override local key discovery (used by tests). */
  identities?: string[];
  /** Override the stored password (used by tests; `null` disables it). */
  storedPassword?: string | null;
  /** Override the known member name, used to skip other members' wraps. */
  username?: string | null;
  /** Write a recovery wrap once membership is proven by a private key. */
  allowRecoveryWrite?: boolean;
}

export interface MembershipOptions {
  /** Override local key discovery (used by tests). */
  sshDir?: string;
}

export type UnwrapMethod = "identity" | "recovery";

export interface UnwrapResult {
  fileKey: string;
  method: UnwrapMethod;
  /** The member whose entry was opened, when known. */
  username?: string;
}

/**
 * Cheap membership probe: does this machine hold the private key for any of the
 * group's members? Matching happens on public key material (the age recipient
 * derived from each local SSH key), so no unwrap, no passphrase prompt, and no
 * crypto are needed just to answer "am I in this group?".
 */
export async function isGroupMember(
  groupName: string,
  options: MembershipOptions = {}
): Promise<boolean> {
  const groupDir = path.join(process.cwd(), "nspt", groupName);
  const userKeys = readUserKeys(groupDir);
  if (!userKeys) return false;

  // A stored portable identity (created when no usable SSH key was available)
  // means this machine can decrypt regardless of its SSH keys.
  if (loadIdentity(groupName)) return true;

  const recipients = new Set<string>();
  for (const user of userKeys.users) {
    for (const entry of user.keys) {
      if (entry.age) recipients.add(entry.age);
    }
  }
  if (recipients.size === 0) return false;

  const local = await discoverLocalKeys(options.sshDir);
  for (const key of local) {
    const recipient = sshPubLineToRecipient(`${key.type} ${key.key}`);
    if (recipient && recipients.has(recipient)) return true;
  }
  return false;
}

export async function verifyGroupMembership(
  groupName: string,
  options: UnwrapOptions = {}
): Promise<boolean> {
  return (await unwrapGroupKey(groupName, options)) !== null;
}

export async function unwrapGroupKey(
  groupName: string,
  options: UnwrapOptions = {}
): Promise<string | null> {
  return (await unwrapGroupKeyDetailed(groupName, options))?.fileKey ?? null;
}

/**
 * Like `unwrapGroupKey`, but reports how the key was obtained and which member
 * it belongs to. Password-first, then stored identities, then a manual password
 * prompt. When a private key proves membership and a recovery password is set,
 * the matching `recovery.toml` entry is refreshed in place.
 */
export async function unwrapGroupKeyDetailed(
  groupName: string,
  options: UnwrapOptions = {}
): Promise<UnwrapResult | null> {
  const root = path.join(process.cwd(), "nspt");
  const groupDir = path.join(root, groupName);
  const userKeys = readUserKeys(groupDir);
  if (!userKeys) return null;

  const storedPassword =
    options.storedPassword !== undefined ? options.storedPassword : getStoredPassword();
  const knownUsername =
    options.username !== undefined ? options.username : getStoredUsername();

  // 1. Stored password (silent, no prompt) — including the auto-heal case where
  //    a rotation left our wrap stale.
  if (storedPassword) {
    const recovered = await tryRecoveryPassword(groupDir, groupName, storedPassword, knownUsername);
    if (recovered) return recovered;
  }

  // 2. Local private keys.
  const identities: string[] = options.identities ? [...options.identities] : [];
  if (!options.identities) {
    const local = await findLocalSshIdentities();
    for (const id of local) identities.push(id.identity);
  }

  if (options.getPassphrase) {
    const encrypted = await findEncryptedLocalKeys();
    for (const key of encrypted) {
      const passphrase = await options.getPassphrase(key.source);
      if (!passphrase) continue;
      const id = sshIdentityWithPassphrase(key.source, passphrase);
      if (id) identities.push(id.identity);
    }
  }

  const legacy = loadIdentity(groupName);
  if (legacy) identities.push(legacy);

  for (const user of userKeys.users) {
    for (const entry of user.keys) {
      for (const identity of identities) {
        const key = await unsealFileKey(entry.wrapped, identity);
        if (!key) continue;
        const result: UnwrapResult = { fileKey: key, method: "identity", username: user.username };
        if (options.allowRecoveryWrite && storedPassword) {
          await armRecoveryEntry(groupDir, root, groupName, user.username, key, storedPassword);
        }
        return result;
      }
    }
  }

  // 3. Manual password prompt — only reached when nothing else opened the group.
  if (options.getRecoveryPassword) {
    const password = await options.getRecoveryPassword();
    if (password) {
      const recovered = await tryRecoveryPassword(groupDir, groupName, password, knownUsername);
      if (recovered) return recovered;
    }
  }

  return null;
}

async function tryRecoveryPassword(
  groupDir: string,
  groupName: string,
  password: string,
  preferredUsername?: string | null
): Promise<UnwrapResult | null> {
  const file = readRecoveryFile(groupDir);
  // scrypt is deliberately expensive, so try the known member's entry first
  // and only then fall back to the others (which our password can't open).
  const entries = preferredUsername
    ? [
        ...file.entries.filter((e) => e.username === preferredUsername),
        ...file.entries.filter((e) => e.username !== preferredUsername),
      ]
    : file.entries;

  for (const entry of entries) {
    const key = await unsealWithPassphrase(entry.wrapped, password);
    if (!key) continue;
    // A wrap made before a rotation still decrypts but holds a dead key.
    if (!fileKeyLooksValid(key, groupName)) continue;
    return { fileKey: key, method: "recovery", username: entry.username };
  }
  return null;
}

async function armRecoveryEntry(
  groupDir: string,
  root: string,
  groupName: string,
  username: string,
  fileKey: string,
  password: string
): Promise<void> {
  const fingerprint = fingerprintFileKey(fileKey);
  const file = readRecoveryFile(groupDir);
  const existing = findRecoveryEntry(file, username);
  if (existing && existing.fingerprint === fingerprint) return;

  const wrapped = await sealToPassphrase(fileKey, password);
  upsertRecoveryEntry(file, { username, fingerprint, wrapped });
  writeRecoveryFile(groupDir, file);
  recordRepoUsage(root, groupName, username);
}
