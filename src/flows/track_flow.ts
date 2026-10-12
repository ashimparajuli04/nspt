import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { addFileToGroupConfig, deriveName, isPathWithinRoot } from "../core/files.js";
import { pickFile } from "../core/file_picker.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { isGroupMember } from "../core/unwrap.js";
import { isBack } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";

export type TrackResult = "tracked" | "cancelled" | "error";

export async function runTrack(groupName?: string, filepath?: string): Promise<TrackResult> {
  const groupProvided = Boolean(groupName);
  let groupAuto = false;

  while (true) {
    if (!groupName || !groupName.trim()) {
      const choice = await chooseGroup("Which group do you want to track a file in?");
      if (choice === null) return "error";
      if (isBack(choice)) return "cancelled";
      groupName = choice.group;
      groupAuto = choice.auto;
    }

    const configPath = path.join(process.cwd(), "nspt", groupName, "config.toml");
    if (!fs.existsSync(configPath)) {
      p.log.error(`Group "${groupName}" doesn't exist. Create it with 'nspt create-group ${groupName}'.`);
      return "error";
    }

    if (!(await isGroupMember(groupName))) {
      const hint = await localKeyUnlockHint();
      p.log.error(
        hint
          ? `You are not a member of "${groupName}".\n${hint}`
          : `You are not a member of "${groupName}". Only members can track files.`
      );
      return "error";
    }

    while (true) {
      if (!filepath || !filepath.trim()) {
        const value = await pickFile();

        if (isBack(value)) {
          if (groupProvided || groupAuto) return "cancelled";
          groupName = undefined;
          break;
        }

        if (value === null) return "cancelled";

        filepath = value;
      }

      if (!fs.existsSync(filepath)) {
        p.log.error(`File "${filepath}" doesn't exist.`);
        return "error";
      }

      if (fs.statSync(filepath).isDirectory()) {
        p.log.error(`"${filepath}" is a directory. Only files can be tracked.`);
        return "error";
      }

      if (!isPathWithinRoot(filepath)) {
        p.log.error(`"${filepath}" is outside this repo. Only files inside the repo can be tracked.`);
        return "error";
      }

      filepath = path.relative(process.cwd(), filepath).split(path.sep).join("/");

      const name = deriveName(filepath);
      const added = addFileToGroupConfig(groupName, { name, path: filepath });

      if (!added) {
        p.log.error(`"${name}" (${filepath}) is already tracked in "${groupName}".`);
        return "error";
      }

      p.log.success(`Tracked ${filepath} as "${name}" in ${groupName}`);
      return "tracked";
    }
  }
}
