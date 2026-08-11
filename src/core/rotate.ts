import * as path from "node:path";
import { generateKey, rotateEncryptedFiles } from "./enc_dec_file.js";
import { readUserKeys, writeUserKeys, removeUser } from "./user_keys.js";
import { sealToFileKey } from "./age_keys.js";
import { fetchUserKeys } from "./github.js";
import { sshPubLineToRecipient } from "./ssh_to_age.js";
import { listTrackedFiles } from "./files.js";

export type RotateStatus = (message: string) => void;

export async function rotateGroupKey(
  groupName: string,
  oldFileKey: string,
  onStatus: RotateStatus,
  removeUsers: string[] = []
): Promise<void> {
  const newFileKey = generateKey();
  const tracked = listTrackedFiles(groupName);
  if (tracked.length > 0) {
    onStatus("Re-encrypting tracked files...");
    rotateEncryptedFiles(oldFileKey, newFileKey, groupName);
  }

  const groupDir = path.join(process.cwd(), "nspt", groupName);
  const userKeys = readUserKeys(groupDir);
  if (!userKeys) {
    throw new Error("Could not read user_keys.toml");
  }

  for (const username of removeUsers) {
    removeUser(userKeys, username);
  }

  for (const user of userKeys.users) {
    onStatus(`Sealing new key for ${user.username}...`);
    const githubKeys = await fetchUserKeys(user.username, { useCache: false });
    const ed25519Keys = githubKeys.filter((k) => k.key.startsWith("ssh-ed25519"));
    const existingSsh = new Set(user.keys.map((k) => k.ssh));

    for (const entry of user.keys) {
      const wrappedResults = await sealToFileKey(newFileKey, [entry.age]);
      const wrapped = wrappedResults[0];
      if (!wrapped) continue;
      entry.wrapped = wrapped;
    }

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
      }
    }
  }

  writeUserKeys(groupDir, userKeys);
}
