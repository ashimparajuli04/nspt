import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { styleText } from "node:util";
import { readDecryptedFile } from "../core/enc_dec_file.js";
import { unwrapGroupKey } from "../core/unwrap.js";
import { listGroups, listTrackedFiles } from "../core/files.js";
import { diffSummary } from "../core/diff.js";
import { readUserKeys, listUsers } from "../core/user_keys.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { getStoredPassword, readRecoveryFile, fingerprintFileKey } from "../core/recovery.js";
import { unsealWithPassphrase } from "../core/age_keys.js";
import { passphraseProvider } from "./passphrase.js";

export type StatusResult = "shown" | "cancelled" | "error";

export interface FileStatus {
  path: string;
  state: "in-sync" | "out-of-date" | "missing-encrypted";
  additions: number;
  deletions: number;
}

export interface GroupStatus {
  group: string;
  members: string[];
  files: FileStatus[];
  /** Set when the group could not be inspected (e.g. not a member). */
  error?: string;
  /** Set when the local recovery entry no longer holds the current file key. */
  recoveryStale?: boolean;
}

function readLocal(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function collectGroupStatus(groupName: string, quiet = false): Promise<GroupStatus> {
  const groupDir = path.join(process.cwd(), "nspt", groupName);
  const userKeys = readUserKeys(groupDir);
  const members = userKeys ? listUsers(userKeys) : [];

  const s = p.spinner();
  if (!quiet) s.start(`Checking "${groupName}"...`);
  const fileKey = await unwrapGroupKey(groupName, { getPassphrase: passphraseProvider(s) });
  if (!quiet) s.stop(`Checked "${groupName}"`);

  if (!fileKey) {
    return { group: groupName, members, files: [], error: "no access (not a member?)" };
  }

  const recoveryStale = await isRecoveryStale(groupDir, fileKey);

  const files: FileStatus[] = [];
  for (const file of listTrackedFiles(groupName)) {
    let remote: string;
    try {
      remote = readDecryptedFile(fileKey, groupName, file);
    } catch {
      files.push({ path: file.path, state: "missing-encrypted", additions: 0, deletions: 0 });
      continue;
    }
    const local = readLocal(file.path);
    const { additions, deletions } = diffSummary(local, remote);
    files.push({
      path: file.path,
      state: additions === 0 && deletions === 0 ? "in-sync" : "out-of-date",
      additions,
      deletions,
    });
  }

  return { group: groupName, members, files, recoveryStale };
}

/**
 * True when this machine's recovery entry still opens but holds a key from
 * before the last rotation. Detection is read-only: no entry is rewritten here
 * (status must not dirty the repo); run Refresh recovery to fix it.
 */
async function isRecoveryStale(groupDir: string, fileKey: string): Promise<boolean> {
  const stored = getStoredPassword();
  if (!stored) return false;

  const fingerprint = fingerprintFileKey(fileKey);
  const file = readRecoveryFile(groupDir);
  for (const entry of file.entries) {
    const unwrapped = await unsealWithPassphrase(entry.wrapped, stored);
    if (!unwrapped) continue; // not ours, or a different password
    if (entry.fingerprint !== fingerprint) return true;
  }
  return false;
}

function printGroup(status: GroupStatus): void {
  const memberText = status.members.length > 0 ? status.members.join(", ") : "(none)";
  console.log(`\n${status.group}  ${styleText("dim", `members: ${memberText}`)}`);

  if (status.error) {
    console.log(`  ${status.error}`);
    return;
  }
  if (status.files.length === 0) {
    console.log("  no tracked files");
    return;
  }

  const width = Math.max(...status.files.map((f) => f.path.length));
  for (const file of status.files) {
    const pad = " ".repeat(width - file.path.length);
    let note: string;
    if (file.state === "in-sync") note = "in sync";
    else if (file.state === "missing-encrypted") note = "missing encrypted copy";
    else note = `out of date (${file.additions} addition(s), ${file.deletions} deletion(s))`;
    console.log(`  ${file.path}${pad}  ${note}`);
  }

  if (status.recoveryStale) {
    console.log(
      `  ${styleText("yellow", "recovery entry stale")} — run Security → Refresh recovery`
    );
  }
}

export async function runStatus(
  groupName?: string,
  options: { json?: boolean } = {}
): Promise<StatusResult> {
  const targets = groupName && groupName.trim() ? [groupName] : listGroups();
  if (targets.length === 0) {
    p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
    return "error";
  }

  const results: GroupStatus[] = [];
  for (const group of targets) {
    if (!fs.existsSync(path.join(process.cwd(), "nspt", group))) {
      p.log.error(`Group "${group}" doesn't exist.`);
      return "error";
    }
    results.push(await collectGroupStatus(group, options.json === true));
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return "shown";
  }

  for (const status of results) printGroup(status);

  if (results.some((r) => r.error)) {
    const hint = await localKeyUnlockHint();
    if (hint) p.log.info(hint);
  }
  return "shown";
}
