import * as path from "node:path";
import { generateKey, rotateEncryptedFiles } from "./enc_dec_file.js";
import { readUserKeys, writeUserKeys, removeUser } from "./user_keys.js";
import { sealToFileKey, sealToPassphrase } from "./age_keys.js";
import { fetchUserKeys } from "./github.js";
import { sshPubLineToRecipient } from "./ssh_to_age.js";
import { listTrackedFiles } from "./files.js";
import {
  fingerprintFileKey,
  getStoredPassword,
  readRecoveryFile,
  recordRepoUsage,
  upsertRecoveryEntry,
  writeRecoveryFile,
} from "./recovery.js";

export type RotateStatus = (message: string) => void;

export async function rotateGroupKey(
  groupName: string,
  oldFileKey: string,
  onStatus: RotateStatus,
  removeUsers: string[] = [],
  /** Member performing the rotation, so their own recovery wrap can be refreshed. */
  initiator?: string
): Promise<void> {
  const newFileKey = generateKey();

  const groupDir = path.join(process.cwd(), "nspt", groupName);
  const userKeys = readUserKeys(groupDir);
  if (!userKeys) {
    throw new Error("Could not read user_keys.toml");
  }

  for (const username of removeUsers) {
    removeUser(userKeys, username);
  }

  // Phase 1: resolve everyone's current GitHub keys. This is the only network
  // step, and it happens before any local mutation, so a rate limit / outage
  // can't leave the group half-rotated.
  const githubKeysByUser = new Map<string, string[]>();
  for (const user of userKeys.users) {
    onStatus(`Fetching keys for ${user.username}...`);
    const githubKeys = await fetchUserKeys(user.username, { useCache: false });
    githubKeysByUser.set(
      user.username,
      githubKeys.filter((k) => k.key.startsWith("ssh-ed25519")).map((k) => k.key)
    );
  }

  // Phase 2: build all new wraps in memory.
  for (const user of userKeys.users) {
    onStatus(`Sealing new key for ${user.username}...`);
    const existingSsh = new Set(user.keys.map((k) => k.ssh));

    for (const entry of user.keys) {
      const wrappedResults = await sealToFileKey(newFileKey, [entry.age]);
      const wrapped = wrappedResults[0];
      if (wrapped) entry.wrapped = wrapped;
    }

    for (const ghKey of githubKeysByUser.get(user.username) ?? []) {
      if (existingSsh.has(ghKey)) continue;
      const recipient = sshPubLineToRecipient(ghKey);
      if (!recipient) continue;
      const wrappedResults = await sealToFileKey(newFileKey, [recipient]);
      const wrapped = wrappedResults[0];
      if (!wrapped) continue;
      user.keys.push({
        age: recipient,
        ssh: ghKey,
        wrapped,
      });
    }
  }

  // Phase 3: re-encrypt tracked files (all-or-nothing), then persist the wraps.
  const tracked = listTrackedFiles(groupName);
  if (tracked.length > 0) {
    onStatus("Re-encrypting tracked files...");
    rotateEncryptedFiles(oldFileKey, newFileKey, groupName);
  }

  writeUserKeys(groupDir, userKeys);

  // The initiator's own recovery wrap now holds a dead key. Re-seal it under
  // the same password so their recovery path survives the rotation. Other
  // members' wraps are left stale on purpose — we don't know their passwords;
  // each is healed on that member's next key-based unlock.
  if (initiator) {
    const password = getStoredPassword();
    if (password) {
      onStatus("Refreshing your recovery entry...");
      const recoveryFile = readRecoveryFile(groupDir);
      const wrapped = await sealToPassphrase(newFileKey, password);
      upsertRecoveryEntry(recoveryFile, {
        username: initiator,
        fingerprint: fingerprintFileKey(newFileKey),
        wrapped,
      });
      writeRecoveryFile(groupDir, recoveryFile);
      recordRepoUsage(path.join(process.cwd(), "nspt"), groupName, initiator);
    }
  }
}
