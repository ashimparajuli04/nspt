import * as fs from "fs";
import * as path from "path";
import * as p from "@clack/prompts";
import { addFileToGroupConfig, deriveName, listGroups } from "../core/files.js";
import { pickFile } from "../core/file_picker.js";

export type TrackResult = "tracked" | "cancelled" | "error";

export async function runTrack(groupName?: string, filepath?: string): Promise<TrackResult> {
  if (!groupName || !groupName.trim()) {
    const groups = listGroups();
    if (groups.length === 0) {
      p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
      return "error";
    }

    const value = await p.select({
      message: "Which group do you want to track a file in?",
      options: groups.map((group) => ({ value: group, label: group })),
    });

    if (p.isCancel(value)) {
      p.cancel("Cancelled.");
      return "cancelled";
    }

    groupName = value;
  }

  const configPath = path.join(process.cwd(), "nspt", groupName, "config.toml");
  if (!fs.existsSync(configPath)) {
    p.log.error(`Group "${groupName}" doesn't exist. Create it with 'nspt create-group ${groupName}'.`);
    return "error";
  }

  if (!filepath || !filepath.trim()) {
    const value = await pickFile();

    if (value === null) {
      p.cancel("Cancelled.");
      return "cancelled";
    }

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

  const name = deriveName(filepath);
  const added = addFileToGroupConfig(groupName, { name, path: filepath });

  if (!added) {
    p.log.error(`"${name}" (${filepath}) is already tracked in "${groupName}".`);
    return "error";
  }

  p.log.success(`Tracked ${filepath} as "${name}" in ${groupName}`);
  return "tracked";
}
