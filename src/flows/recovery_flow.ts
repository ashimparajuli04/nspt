import * as path from "node:path";
import * as p from "@clack/prompts";
import { password, confirm, isBack } from "../core/ui/prompt.js";
import {
  validateRecoveryPassword,
  getStoredPassword,
  setStoredPassword,
  clearStoredPassword,
  knownRecoveryRepos,
  readRecoveryFile,
  writeRecoveryFile,
  removeRecoveryEntry,
  fingerprintFileKey,
} from "../core/recovery.js";
import { sealToPassphrase, unsealWithPassphrase } from "../core/age_keys.js";
import { unwrapGroupKeyDetailed } from "../core/unwrap.js";
import { listGroups } from "../core/files.js";
import { passphraseProvider } from "./passphrase.js";

/** Prompt until the password passes the rules and matches its confirmation. */
async function promptNewPassword(): Promise<string | null> {
  for (;;) {
    const value = await password({ message: "New recovery password:" });
    if (isBack(value)) return null;
    const check = validateRecoveryPassword(value);
    if (!check.ok) {
      p.log.error(check.message ?? "Password is too weak.");
      continue;
    }
    const again = await password({ message: "Confirm recovery password:" });
    if (isBack(again)) return null;
    if (again !== value) {
      p.log.error("Passwords don't match. Try again.");
      continue;
    }
    return value;
  }
}

/**
 * Walk every group in the current repo and let a private key prove membership,
 * which writes the password-wrapped entry. Groups the user can't open are
 * skipped silently — this is opportunistic arming, not a membership check.
 */
async function armRepoEntries(recoveryPassword: string): Promise<number> {
  const groups = listGroups();
  if (groups.length === 0) return 0;

  const s = p.spinner();
  s.start("Arming recovery entries...");
  let armed = 0;
  for (const group of groups) {
    s.message(`Arming recovery for "${group}"...`);
    const result = await unwrapGroupKeyDetailed(group, {
      storedPassword: recoveryPassword,
      allowRecoveryWrite: true,
      getPassphrase: passphraseProvider(s),
    });
    if (result?.method === "identity") armed += 1;
  }
  s.stop("Recovery entries checked");
  return armed;
}

/** Re-wrap existing entries that the old password can still open. */
async function rewrapCurrentRepo(oldPassword: string, newPassword: string): Promise<number> {
  let count = 0;
  for (const group of listGroups()) {
    const groupDir = path.join(process.cwd(), "nspt", group);
    const file = readRecoveryFile(groupDir);
    let changed = false;
    for (const entry of file.entries) {
      const fileKey = await unsealWithPassphrase(entry.wrapped, oldPassword);
      if (!fileKey) continue;
      entry.wrapped = await sealToPassphrase(fileKey, newPassword);
      entry.fingerprint = fingerprintFileKey(fileKey);
      changed = true;
      count += 1;
    }
    if (changed) writeRecoveryFile(groupDir, file);
  }
  return count;
}

export async function runSetRecoveryPassword(): Promise<string> {
  if (getStoredPassword()) {
    p.log.info("A recovery password is already set for this machine.");
    return runChangeRecoveryPassword();
  }

  const newPassword = await promptNewPassword();
  if (!newPassword) return "cancelled";

  setStoredPassword(newPassword);
  p.log.success("Recovery password set for this machine.");

  const armed = await armRepoEntries(newPassword);
  if (armed > 0) {
    p.log.info("Commit the recovery.toml files that were created so they travel with the repo.");
  } else {
    p.log.info(
      "No entries armed yet. Open a repo you're a member of and unlock it (or run " +
      "\"Refresh recovery\") to write one."
    );
  }
  return "set";
}

export async function runChangeRecoveryPassword(): Promise<string> {
  const current = getStoredPassword();
  if (!current) {
    p.log.info("No recovery password is set yet.");
    return runSetRecoveryPassword();
  }

  const oldPassword = await password({ message: "Current recovery password:" });
  if (isBack(oldPassword)) return "cancelled";
  if (oldPassword !== current) {
    p.log.error("That doesn't match the stored recovery password.");
    return "error";
  }

  const newPassword = await promptNewPassword();
  if (!newPassword) return "cancelled";

  const rewrapped = await rewrapCurrentRepo(current, newPassword);
  // Only swap the stored password once the old wraps are safely re-sealed.
  setStoredPassword(newPassword);
  const armed = await armRepoEntries(newPassword);

  const cwd = path.resolve(process.cwd());
  const others = knownRecoveryRepos()
    .map((r) => path.resolve(r.root))
    .filter((root) => root !== cwd);
  if (others.length > 0) {
    p.log.warn(
      "Password changed for THIS repo only. The following repos still hold entries under your " +
        "old password and will fail to recover until you change the password from inside them:\n  " +
        others.join("\n  ")
    );
  }

  const bits: string[] = [];
  if (rewrapped > 0) bits.push(`${rewrapped} entry(ies) re-wrapped`);
  if (armed > 0) bits.push(`${armed} group(s) refreshed`);
  p.log.success(`Recovery password changed${bits.length ? ` (${bits.join(", ")})` : ""}.`);
  return "changed";
}

export async function runClearRecoveryPassword(): Promise<string> {
  const current = getStoredPassword();
  if (!current) {
    p.log.info("No recovery password is set.");
    return "cancelled";
  }

  const ok = await confirm({
    message: "Remove the recovery password from this machine?",
    initialValue: false,
  });
  if (isBack(ok)) return "cancelled";
  if (!ok) {
    p.log.info("Nothing cleared.");
    return "cancelled";
  }

  let removed = 0;
  const groups = listGroups();
  if (groups.length > 0) {
    const drop = await confirm({
      message:
        "Also delete recovery entries from this repo's groups? They stay crackable in the " +
        "committed files otherwise.",
      initialValue: false,
    });
    if (isBack(drop)) return "cancelled";
    if (drop) {
      for (const group of groups) {
        const groupDir = path.join(process.cwd(), "nspt", group);
        const file = readRecoveryFile(groupDir);
        let changed = false;
        for (const entry of file.entries) {
          const fileKey = await unsealWithPassphrase(entry.wrapped, current);
          if (!fileKey) continue;
          if (removeRecoveryEntry(file, entry.username)) {
            changed = true;
            removed += 1;
          }
        }
        if (changed) writeRecoveryFile(groupDir, file);
      }
    }
  }

  clearStoredPassword();
  p.log.success(
    `Recovery password cleared${removed > 0 ? ` and ${removed} entry(ies) removed` : ""}.`
  );
  return "cleared";
}

export async function runRefreshRecoveryPassword(groupName?: string): Promise<string> {
  const recoveryPassword = getStoredPassword();
  if (!recoveryPassword) {
    p.log.error("No recovery password set. Use Security → Set recovery password first.");
    return "error";
  }

  const groups = groupName && groupName.trim() ? [groupName.trim()] : listGroups();
  if (groups.length === 0) {
    p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
    return "error";
  }

  const s = p.spinner();
  s.start("Refreshing recovery entries...");
  let armed = 0;
  for (const group of groups) {
    s.message(`Refreshing recovery for "${group}"...`);
    const result = await unwrapGroupKeyDetailed(group, {
      storedPassword: recoveryPassword,
      allowRecoveryWrite: true,
      getPassphrase: passphraseProvider(s),
    });
    if (result?.method === "identity") armed += 1;
  }
  s.stop("Done");

  if (armed > 0) {
    p.log.success(`Refreshed recovery for ${armed} group(s). Commit the updated recovery.toml.`);
  } else {
    p.log.warn(
      "Couldn't refresh via a private key — only a member's key can write a fresh entry."
    );
  }
  return "refreshed";
}
