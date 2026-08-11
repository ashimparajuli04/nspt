import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { listGroups, listTrackedFiles, removeFileFromGroupConfig } from "../core/files.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { verifyGroupMembership } from "../core/unwrap.js";
import { passphraseProvider } from "./passphrase.js";
import { select, confirm, isBack } from "../core/ui/prompt.js";

export type UntrackResult = "untracked" | "cancelled" | "error";

export async function runUntrack(groupName?: string): Promise<UntrackResult> {
  const groupProvided = Boolean(groupName);

  while (true) {
    if (!groupName || !groupName.trim()) {
      const groups = listGroups();
      if (groups.length === 0) {
        p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
        return "error";
      }

      const value = await select({
        message: "Which group do you want to untrack a file from?",
        options: groups.map((group) => ({ value: group, label: group })),
      });

      if (isBack(value)) return "cancelled";

      groupName = value;
    }

    const configPath = path.join(process.cwd(), "nspt", groupName, "config.toml");
    if (!fs.existsSync(configPath)) {
      p.log.error(`Group "${groupName}" doesn't exist.`);
      return "error";
    }

    const s = p.spinner();
    s.start("Verifying group membership...");
    const isMember = await verifyGroupMembership(groupName, { getPassphrase: passphraseProvider(s) });
    if (!isMember) {
      s.stop("Failed");
      const hint = await localKeyUnlockHint();
      p.log.error(
        hint
          ? `You are not a member of "${groupName}".\n${hint}`
          : `You are not a member of "${groupName}". Only members can untrack files.`
      );
      return "error";
    }
    s.clear();

    const files = listTrackedFiles(groupName);
    if (files.length === 0) {
      p.log.error(`No tracked files in "${groupName}".`);
      return "error";
    }

    while (true) {
      const value = await select({
        message: "Which file do you want to untrack?",
        options: files.map((f) => ({ value: f.name, label: `${f.name} (${f.path})` })),
      });

      if (isBack(value)) {
        if (groupProvided) return "cancelled";
        groupName = undefined;
        break;
      }

      const entry = files.find((f) => f.name === value);
      if (!entry) {
        p.log.error("Could not find that file in the group config.");
        return "error";
      }

      const confirmed = await confirm({
        message: `Untrack "${entry.path}" and delete its encrypted copy?`,
        initialValue: false,
      });

      if (isBack(confirmed)) continue;

      if (!confirmed) {
        p.log.info("Nothing untracked.");
        return "cancelled";
      }

      const removed = removeFileFromGroupConfig(groupName, entry.name);
      if (!removed) {
        p.log.error(`Could not remove "${entry.path}" from the group config.`);
        return "error";
      }

      const encPath = path.join(process.cwd(), "nspt", groupName, "encfiles", `${entry.name}.enc`);
      if (fs.existsSync(encPath)) {
        fs.rmSync(encPath);
      }

      p.log.success(`Untracked "${entry.path}" and removed its encrypted copy.`);
      return "untracked";
    }
  }
}
