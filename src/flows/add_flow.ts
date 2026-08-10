import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { unwrapGroupKey } from "../core/unwrap.js";
import { generateAgeIdentity, sealToFileKey } from "../core/age_keys.js";
import { fetchUserKeys, GithubRateLimitError } from "../core/github.js";
import { readUserKeys, writeUserKeys, addUserKey } from "../core/user_keys.js";
import { listGroups } from "../core/files.js";

export type AddResult = "added" | "cancelled" | "error";

export async function runAdd(
  groupName?: string,
  inviteeUsername?: string
): Promise<AddResult> {
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

  if (!inviteeUsername || !inviteeUsername.trim()) {
    const value = await p.text({
      message: "GitHub username of the person to add:",
      placeholder: "e.g. alice04",
    });
    if (p.isCancel(value)) { p.cancel("Cancelled."); return "cancelled"; }
    inviteeUsername = value;
  }

  const s = p.spinner();
  s.start("Unwrapping group key...");

  const fileKey = await unwrapGroupKey(groupName);
  if (!fileKey) {
    s.stop("Failed");
    p.log.error("Could not unwrap group key. Only members can add users.");
    return "error";
  }

  s.clear();

  s.start(`Fetching GitHub keys for ${inviteeUsername}...`);
  let githubKeys;
  try {
    githubKeys = await fetchUserKeys(inviteeUsername);
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

  s.start("Generating age identity for invitee...");
  const ageIdentity = await generateAgeIdentity();
  const wrappedResults = await sealToFileKey(fileKey, [ageIdentity.recipient]);
  const wrapped = wrappedResults[0];
  if (!wrapped) {
    s.stop("Failed");
    p.log.error("Failed to seal file key");
    return "error";
  }
  s.clear();

  const userKeys = readUserKeys(groupPath);
  if (!userKeys) {
    p.log.error("Could not read user_keys.toml");
    return "error";
  }

  const sshDisplay = ed25519Keys[0]?.key ?? "ssh-ed25519 (local)";

  const added = addUserKey(userKeys, inviteeUsername, {
    age: ageIdentity.recipient,
    ssh: sshDisplay,
    wrapped,
  });

  if (!added) {
    p.log.warn("User already has this key. Nothing to add.");
    return "added";
  }

  writeUserKeys(groupPath, userKeys);
  p.log.success(`Added ${inviteeUsername} to group "${groupName}"`);
  return "added";
}

