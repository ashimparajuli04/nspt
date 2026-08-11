import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { unwrapGroupKey } from "../core/unwrap.js";
import { rotateGroupKey } from "../core/rotate.js";
import { readUserKeys, listUsers } from "../core/user_keys.js";
import { listGroups } from "../core/files.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { getCachedUsername } from "../core/identity.js";
import { passphraseProvider } from "./passphrase.js";
import { select, confirm, isBack, withEscInert } from "../core/ui/prompt.js";

export type RemoveResult = "removed" | "cancelled" | "error";

export async function runRemove(groupName?: string, username?: string): Promise<RemoveResult> {
  const groupProvided = Boolean(groupName);
  const usernameProvided = Boolean(username);

  while (true) {
    if (!groupName || !groupName.trim()) {
      const groups = listGroups();
      if (groups.length === 0) {
        p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
        return "error";
      }

      const value = await select({
        message: "Which group do you want to remove a user from?",
        options: groups.map((group) => ({ value: group, label: group })),
      });

      if (isBack(value)) return "cancelled";

      groupName = value;
    }

    const groupPath = path.join(process.cwd(), "nspt", groupName);
    if (!fs.existsSync(groupPath)) {
      p.log.error(`Group "${groupName}" doesn't exist.`);
      return "error";
    }
    const activeGroup: string = groupName;

    const s = p.spinner();
    s.start("Unwrapping group key...");

    const fileKey = await unwrapGroupKey(groupName, { getPassphrase: passphraseProvider(s) });
    if (!fileKey) {
      s.stop("Failed");
      const hint = await localKeyUnlockHint();
      p.log.error(
        hint
          ? `Could not unwrap group key.\n${hint}`
          : "Could not unwrap group key. Only members can remove users."
      );
      return "error";
    }
    s.clear();

    const userKeys = readUserKeys(groupPath);
    if (!userKeys) {
      p.log.error("Could not read user_keys.toml");
      return "error";
    }

    const users = listUsers(userKeys);
    if (users.length === 0) {
      p.log.error(`No users in "${groupName}".`);
      return "error";
    }

    while (true) {
      if (!username || !username.trim()) {
        const value = await select({
          message: "Which user do you want to remove?",
          options: users.map((u) => ({ value: u, label: u })),
        });
        if (isBack(value)) {
          if (groupProvided) return "cancelled";
          groupName = undefined;
          break;
        }
        username = value;
      }

      if (!users.includes(username)) {
        p.log.error(`"${username}" is not a member of "${groupName}".`);
        return "error";
      }

      const cachedUsername = getCachedUsername();
      if (cachedUsername && cachedUsername === username) {
        p.log.error(`You can't remove yourself ("${username}") from the group.`);
        return "error";
      }

      const confirmed = await confirm({
        message:
          `Removing "${username}" revokes their access and re-encrypts all files ` +
          `with a new key for the remaining members of "${groupName}". Continue?`,
        initialValue: false,
      });

      if (isBack(confirmed)) {
        if (usernameProvided) return "cancelled";
        username = undefined;
        continue;
      }

      if (!confirmed) {
        p.log.info("Nothing removed.");
        return "cancelled";
      }

      s.start("Rotating file key...");
      try {
        const activeUser: string = username;
        await withEscInert(async () => {
          await rotateGroupKey(activeGroup, fileKey, (msg) => {
            s.message(msg);
          }, [activeUser]);
        });
        s.stop("File key rotated");
        p.log.success(`Removed ${username} from "${groupName}" and rotated the file key`);
        return "removed";
      } catch (err) {
        s.stop("Failed");
        p.log.error(
          `Removing "${username}" failed: ${(err as Error).message}. ` +
            "No changes were written to the group."
        );
        return "error";
      }
    }
  }
}
