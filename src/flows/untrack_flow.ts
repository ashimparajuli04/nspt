import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { listTrackedFiles, removeFileFromGroupConfig } from "../core/files.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { isGroupMember } from "../core/unwrap.js";
import { select, confirm, isBack } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";

export type UntrackResult = "untracked" | "cancelled" | "error";

export async function runUntrack(groupName?: string): Promise<UntrackResult> {
  const groupProvided = Boolean(groupName);
  let groupAuto = false;

  while (true) {
    if (!groupName || !groupName.trim()) {
      const choice = await chooseGroup("Which group do you want to untrack a file from?");
      if (choice === null) return "error";
      if (isBack(choice)) return "cancelled";
      groupName = choice.group;
      groupAuto = choice.auto;
    }

    const configPath = path.join(process.cwd(), "nspt", groupName, "config.toml");
    if (!fs.existsSync(configPath)) {
      p.log.error(`Group "${groupName}" doesn't exist.`);
      return "error";
    }

    if (!(await isGroupMember(groupName))) {
      const hint = await localKeyUnlockHint();
      p.log.error(
        hint
          ? `You are not a member of "${groupName}".\n${hint}`
          : `You are not a member of "${groupName}". Only members can untrack files.`
      );
      return "error";
    }

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
        if (groupProvided || groupAuto) return "cancelled";
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
