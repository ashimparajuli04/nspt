import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { encryptAllTrackedFiles } from "../core/enc_dec_file.js";
import { unwrapGroupKey } from "../core/unwrap.js";

export type SyncUpResult = "synced" | "cancelled" | "error";

export async function runSyncUp(groupName?: string): Promise<SyncUpResult> {
  if (!groupName || !groupName.trim()) {
    const groups = listGroups();
    if (groups.length === 0) {
      p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
      return "error";
    }

    const value = await p.select({
      message: "Which group do you want to sync up?",
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

  const s = p.spinner();
  s.start("Unwrapping group key...");

  const fileKey = await unwrapGroupKey(groupName);
  if (!fileKey) {
    s.stop("Failed");
    p.log.error("Could not unwrap group key. Are you a member of this group?");
    return "error";
  }

  s.stop("Group key unwrapped");

  s.start("Encrypting tracked files...");
  try {
    encryptAllTrackedFiles(fileKey, groupName);
    s.stop("All tracked files encrypted");
    p.log.success(`Synced up group "${groupName}"`);
    return "synced";
  } catch (err) {
    s.stop("Failed");
    p.log.error(`Encryption failed: ${(err as Error).message}`);
    return "error";
  }
}

function listGroups(): string[] {
  const root = path.join(process.cwd(), "nspt");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
