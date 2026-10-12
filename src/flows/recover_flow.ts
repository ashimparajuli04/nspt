import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { decryptAllFiles } from "../core/enc_dec_file.js";
import { unwrapGroupKeyDetailed } from "../core/unwrap.js";
import { getStoredPassword, readRecoveryFile, setStoredPassword } from "../core/recovery.js";
import { password, confirm, isBack } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";
import { passphraseProvider } from "./passphrase.js";

export type RecoverResult = "recovered" | "cancelled" | "error";

/**
 * Keyless entry point: unlock a group with the recovery password and restore
 * its tracked files. Deliberately does not require an ssh-ed25519 key, since
 * recovery is exactly for machines that don't have one.
 */
export async function runRecover(groupName?: string): Promise<RecoverResult> {
  if (!groupName || !groupName.trim()) {
    const choice = await chooseGroup("Which group do you want to recover?");
    if (choice === null) return "error";
    if (isBack(choice)) return "cancelled";
    groupName = choice.group;
  }

  const groupDir = path.join(process.cwd(), "nspt", groupName);
  if (!fs.existsSync(groupDir)) {
    p.log.error(`Group "${groupName}" doesn't exist.`);
    return "error";
  }

  const storedPassword = getStoredPassword();
  const recoveryFile = readRecoveryFile(groupDir);

  // Nothing to recover with: no password on this machine and no committed wrap.
  // Prompting for a password here would be a dead end, and silently falling
  // back to a local key is what `nspt pull` is for.
  if (!storedPassword && recoveryFile.entries.length === 0) {
    p.log.error(
      `Group "${groupName}" has no recovery entry, and no recovery password is set on this machine.`
    );
    p.log.info(
      "If you're a member, use 'nspt pull'. To enable recovery, set a password from " +
        "Security → Set recovery password."
    );
    return "error";
  }

  let recoveryPassword = storedPassword;
  if (!recoveryPassword) {
    const entered = await password({ message: "Recovery password:" });
    if (isBack(entered)) return "cancelled";
    recoveryPassword = entered;
  }

  const s = p.spinner();
  s.start("Unlocking with recovery password...");

  const unlocked = await unwrapGroupKeyDetailed(groupName, {
    storedPassword: recoveryPassword,
    getPassphrase: passphraseProvider(s),
  });

  if (!unlocked) {
    s.stop("Failed");
    p.log.error(
      storedPassword
        ? "Your recovery password doesn't unlock this group, and no local key could either."
        : "That recovery password doesn't unlock this group, and no local key could either."
    );
    return "error";
  }

  // Be honest about how it opened: if a key did the work, the password wasn't
  // the thing that recovered the group.
  if (unlocked.method === "identity") {
    s.stop("Unlocked with your local key");
    p.log.info(
      "Your local SSH key already unlocks this group, so no recovery password was needed. " +
        "Use 'nspt pull' for this next time."
    );
  }

  s.start("Restoring files...");
  try {
    decryptAllFiles(unlocked.fileKey, groupName);
    s.stop("Files restored");
    if (unlocked.method === "recovery") {
      p.log.success(`Recovered group "${groupName}" with your recovery password.`);
    } else {
      p.log.success(`Restored files for group "${groupName}".`);
    }

    // Keyless recovery worked, so offer to remember the password. Saving it
    // enables silent unlocking and lets membership auto-arm a fresh wrap.
    if (!storedPassword && unlocked.method === "recovery") {
      const save = await confirm({
        message: "Save this recovery password on this machine for silent unlocking?",
        initialValue: false,
      });
      if (!isBack(save) && save) {
        setStoredPassword(recoveryPassword);
        p.log.success("Recovery password saved. Future unlocks won't ask for it.");
      }
    }
    return "recovered";
  } catch (err) {
    s.stop("Failed");
    p.log.error(`Decryption failed: ${(err as Error).message}`);
    return "error";
  }
}
