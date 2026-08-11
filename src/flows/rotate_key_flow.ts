import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { unwrapGroupKey } from "../core/unwrap.js";
import { sealToFileKey } from "../core/age_keys.js";
import { fetchUserKeys, GithubRateLimitError } from "../core/github.js";
import { generateKey, rotateEncryptedFiles } from "../core/enc_dec_file.js";
import { readUserKeys, writeUserKeys } from "../core/user_keys.js";
import { listGroups } from "../core/files.js";
import { sshPubLineToRecipient } from "../core/ssh_to_age.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { passphraseProvider } from "./passphrase.js";

export type RotateKeyResult = "rotated" | "cancelled" | "error";

export async function runRotateKey(groupName?: string): Promise<RotateKeyResult> {
  if (!groupName || !groupName.trim()) {
    const groups = listGroups();
    if (groups.length === 0) {
      p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
      return "error";
    }

    const value = await p.select({
      message: "Which group do you want to rotate the file key for?",
      options: groups.map((group) => ({ value: group, label: group })),
    });

    if (p.isCancel(value)) {
      p.cancel("Cancelled.");
      return "cancelled";
    }

    groupName = value;
  }

  const groupPath = path.join(process.cwd(), "nspt", groupName);
  if (!fs.existsSync(groupPath)) {
    p.log.error(`Group "${groupName}" doesn't exist.`);
    return "error";
  }

  const confirmed = await p.confirm({
    message:
      `Rotating the file key for "${groupName}" re-encrypts all tracked files and ` +
      "re-wraps the key for every member. Old wraps become useless. Continue?",
    initialValue: false,
  });

  if (p.isCancel(confirmed)) {
    p.cancel("Cancelled.");
    return "cancelled";
  }

  if (!confirmed) {
    p.log.info("Nothing rotated.");
    return "cancelled";
  }

  const s = p.spinner();
  s.start("Unwrapping group key...");

  const oldFileKey = await unwrapGroupKey(groupName, { getPassphrase: passphraseProvider(s) });
  if (!oldFileKey) {
    s.stop("Failed");
    const hint = await localKeyUnlockHint();
    p.log.error(
      hint
        ? `Could not unwrap group key.\n${hint}`
        : "Could not unwrap group key. Only members can rotate the key."
    );
    return "error";
  }

  s.clear();

  const newFileKey = generateKey();

  s.start("Re-encrypting tracked files...");
  try {
    rotateEncryptedFiles(oldFileKey, newFileKey, groupName);
  } catch (err) {
    s.stop("Failed");
    p.log.error(`Failed to rotate files: ${(err as Error).message}`);
    return "error";
  }
  s.clear();

  const userKeys = readUserKeys(groupPath);
  if (!userKeys) {
    p.log.error("Could not read user_keys.toml");
    return "error";
  }

  for (const user of userKeys.users) {
    s.start(`Sealing new key for ${user.username}...`);
    let githubKeys;
    try {
      githubKeys = await fetchUserKeys(user.username, { useCache: false });
    } catch (err) {
      if (err instanceof GithubRateLimitError) {
        s.stop("Rate limited");
        p.log.error(err.message);
        return "error";
      }
      throw err;
    }
    const ed25519Keys = githubKeys.filter((k) => k.key.startsWith("ssh-ed25519"));
    const existingSsh = new Set(user.keys.map((k) => k.ssh));

    for (const entry of user.keys) {
      const wrappedResults = await sealToFileKey(newFileKey, [entry.age]);
      const wrapped = wrappedResults[0];
      if (!wrapped) continue;
      entry.wrapped = wrapped;
    }

    let newKeys = 0;
    for (const ghKey of ed25519Keys) {
      if (!existingSsh.has(ghKey.key)) {
        const recipient = sshPubLineToRecipient(ghKey.key);
        if (!recipient) continue;
        const wrappedResults = await sealToFileKey(newFileKey, [recipient]);
        const wrapped = wrappedResults[0];
        if (!wrapped) continue;
        user.keys.push({
          age: recipient,
          ssh: ghKey.key,
          wrapped,
        });
        newKeys++;
      }
    }

    s.stop(`${user.username}: re-wrapped ${user.keys.length} key(s)`);
  }

  writeUserKeys(groupPath, userKeys);
  p.log.success(`Rotated the file key for group "${groupName}"`);
  return "rotated";
}
