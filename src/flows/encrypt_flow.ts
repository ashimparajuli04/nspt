import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { encryptAllTrackedFiles } from "../core/enc_dec_file.js";
import { unwrapGroupKey } from "../core/unwrap.js";
import { listGroups } from "../core/files.js";
import { passphraseProvider } from "./passphrase.js";

export type EncryptResult = "encrypted" | "cancelled" | "error";

export async function runEncrypt(groupName?: string): Promise<EncryptResult> {
  if (!groupName || !groupName.trim()) {
    const groups = listGroups();
    if (groups.length === 0) {
      p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
      return "error";
    }

    const value = await p.select({
      message: "Which group do you want to encrypt files for?",
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

  const fileKey = await unwrapGroupKey(groupName, { getPassphrase: passphraseProvider(s) });
  if (!fileKey) {
    s.stop("Failed");
    p.log.error("Could not unwrap group key. Are you a member of this group?");
    return "error";
  }

  s.clear();

  s.start("Encrypting tracked files...");
  try {
    encryptAllTrackedFiles(fileKey, groupName);
    s.stop("All tracked files encrypted");
    p.log.success(`Encrypted files for group "${groupName}"`);
    return "encrypted";
  } catch (err) {
    s.stop("Failed");
    p.log.error(`Encryption failed: ${(err as Error).message}`);
    return "error";
  }
}
