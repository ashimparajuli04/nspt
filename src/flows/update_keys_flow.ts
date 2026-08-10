import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { unwrapGroupKey } from "../core/unwrap.js";
import { fetchUserKeys, GithubRateLimitError } from "../core/github.js";
import { readUserKeys, writeUserKeys } from "../core/user_keys.js";
import { listGroups } from "../core/files.js";

export type UpdateKeysResult = "updated" | "cancelled" | "error";

export async function runUpdateKeys(groupName?: string): Promise<UpdateKeysResult> {
  if (!groupName || !groupName.trim()) {
    const groups = listGroups();
    if (groups.length === 0) {
      p.log.error("No groups yet.");
      return "error";
    }
    const value = await p.select({
      message: "Which group?",
      options: groups.map((g) => ({ value: g, label: g })),
    });
    if (p.isCancel(value)) { p.cancel("Cancelled."); return "cancelled"; }
    groupName = value;
  }

  const groupPath = path.join(process.cwd(), "nspt", groupName);
  if (!fs.existsSync(groupPath)) {
    p.log.error(`Group "${groupName}" doesn't exist.`);
    return "error";
  }

  const s = p.spinner();
  s.start("Unwrapping group key...");

  const fileKey = await unwrapGroupKey(groupName);
  if (!fileKey) {
    s.stop("Failed");
    p.log.error("Could not unwrap group key. Only members can update keys.");
    return "error";
  }

  s.clear();

  const userKeys = readUserKeys(groupPath);
  if (!userKeys) {
    p.log.error("Could not read user_keys.toml");
    return "error";
  }

  let updatedCount = 0;

  for (const user of userKeys.users) {
    s.start(`Fetching keys for ${user.username}...`);
    let githubKeys;
    try {
      githubKeys = await fetchUserKeys(user.username);
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

    let newKeys = 0;
    for (const ghKey of ed25519Keys) {
      if (!existingSsh.has(ghKey.key)) {
        const { generateAgeIdentity, sealToFileKey } = await import("../core/age_keys.js");
        const ageIdentity = await generateAgeIdentity();
        const wrappedResults = await sealToFileKey(fileKey, [ageIdentity.recipient]);
        const wrapped = wrappedResults[0];
        if (!wrapped) continue;
        user.keys.push({
          age: ageIdentity.recipient,
          ssh: ghKey.key,
          wrapped,
        });
        newKeys++;
      }
    }

    if (newKeys > 0) {
      updatedCount += newKeys;
      s.stop(`${user.username}: added ${newKeys} new key(s)`);
    } else {
      s.stop(`${user.username}: no new keys`);
    }
  }

  writeUserKeys(groupPath, userKeys);
  p.log.success(`Updated keys for group "${groupName}" (${updatedCount} new wrap(s))`);
  return "updated";
}

