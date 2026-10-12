import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { decryptAllFiles } from "../core/enc_dec_file.js";
import { unwrapGroupKey } from "../core/unwrap.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { passphraseProvider, promptRecoveryPassword } from "./passphrase.js";
import { isBack } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";

export type DecryptResult = "decrypted" | "cancelled" | "error";

export async function runDecrypt(groupName?: string): Promise<DecryptResult> {
  if (!groupName || !groupName.trim()) {
    const choice = await chooseGroup("Which group do you want to decrypt files for?");
    if (choice === null) return "error";
    if (isBack(choice)) return "cancelled";
    groupName = choice.group;
  }

  const groupPath = path.join(process.cwd(), "nspt", groupName);
  if (!fs.existsSync(groupPath)) {
    p.log.error(`Group "${groupName}" doesn't exist.`);
    return "error";
  }

  const s = p.spinner();
  s.start("Unwrapping group key...");

  const fileKey = await unwrapGroupKey(groupName, {
    getPassphrase: passphraseProvider(s),
    getRecoveryPassword: promptRecoveryPassword,
    allowRecoveryWrite: true,
  });
  if (!fileKey) {
    s.stop("Failed");
    const hint = await localKeyUnlockHint();
    p.log.error(
      hint
        ? `Could not unwrap group key.\n${hint}`
        : "Could not unwrap group key. Are you a member of this group?"
    );
    return "error";
  }

  s.clear();

  s.start("Decrypting files...");
  try {
    decryptAllFiles(fileKey, groupName);
    s.stop("All files decrypted");
    p.log.success(`Decrypted files for group "${groupName}"`);
    return "decrypted";
  } catch (err) {
    s.stop("Failed");
    p.log.error(`Decryption failed: ${(err as Error).message}`);
    return "error";
  }
}
