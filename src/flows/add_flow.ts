import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { unwrapGroupKey } from "../core/unwrap.js";
import { sealToFileKey } from "../core/age_keys.js";
import { fetchUserKeys, GithubRateLimitError } from "../core/github.js";
import { readUserKeys, writeUserKeys, addUserKey } from "../core/user_keys.js";
import { sshPubLineToRecipient } from "../core/ssh_to_age.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { passphraseProvider } from "./passphrase.js";
import { text, isBack } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";

export type AddResult = "added" | "cancelled" | "error";

export async function runAdd(
  groupName?: string,
  inviteeUsername?: string
): Promise<AddResult> {
  const groupProvided = Boolean(groupName);
  let groupAuto = false;

  while (true) {
    if (!groupName || !groupName.trim()) {
      const choice = await chooseGroup("Which group?");
      if (choice === null) return "error";
      if (isBack(choice)) return "cancelled";
      groupName = choice.group;
      groupAuto = choice.auto;
    }

    const groupPath = path.join(process.cwd(), "nspt", groupName);
    if (!fs.existsSync(groupPath)) {
      p.log.error(`Group "${groupName}" doesn't exist.`);
      return "error";
    }

    if (!inviteeUsername || !inviteeUsername.trim()) {
      const value = await text({
        message: "GitHub username of the person to add:",
        placeholder: "e.g. alice04",
      });
      if (isBack(value)) {
        if (groupProvided || groupAuto) return "cancelled";
        groupName = undefined;
        continue;
      }
      inviteeUsername = value;
    }

    const s = p.spinner();
    s.start("Unwrapping group key...");

    const fileKey = await unwrapGroupKey(groupName, { getPassphrase: passphraseProvider(s), allowRecoveryWrite: true });
    if (!fileKey) {
      s.stop("Failed");
      const hint = await localKeyUnlockHint();
      p.log.error(
        hint
          ? `Could not unwrap group key.\n${hint}`
          : "Could not unwrap group key. Only members can add users."
      );
      return "error";
    }

    s.clear();

    s.start(`Fetching GitHub keys for ${inviteeUsername}...`);
    let githubKeys;
    try {
      githubKeys = await fetchUserKeys(inviteeUsername, { useCache: false });
    } catch (err) {
      if (err instanceof GithubRateLimitError) {
        s.stop("Failed");
        p.log.error(err.message);
        return "error";
      }
      throw err;
    }
    const ed25519Keys = githubKeys.filter((k) => k.key.startsWith("ssh-ed25519"));

    if (ed25519Keys.length === 0) {
      s.stop("Failed");
      p.log.error(`${inviteeUsername} has no ssh-ed25519 keys on GitHub.`);
      return "error";
    }

    s.clear();

    const userKeys = readUserKeys(groupPath);
    if (!userKeys) {
      p.log.error("Could not read user_keys.toml");
      return "error";
    }

    s.start("Sealing group key to invitee's SSH keys...");
    let added = 0;
    for (const ghKey of ed25519Keys) {
      const recipient = sshPubLineToRecipient(ghKey.key);
      if (!recipient) continue;
      const wrappedResults = await sealToFileKey(fileKey, [recipient]);
      const wrapped = wrappedResults[0];
      if (!wrapped) continue;
      if (addUserKey(userKeys, inviteeUsername, {
        age: recipient,
        ssh: ghKey.key,
        wrapped,
      })) {
        added++;
      }
    }
    s.clear();

    if (added === 0) {
      p.log.warn("User already has these keys. Nothing to add.");
      return "added";
    }

    writeUserKeys(groupPath, userKeys);
    p.log.success(`Added ${inviteeUsername} to group "${groupName}"`);
    return "added";
  }
}
