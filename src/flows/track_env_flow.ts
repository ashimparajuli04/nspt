import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { addFileToGroupConfig, deriveName } from "../core/files.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { isGroupMember } from "../core/unwrap.js";
import { isBack, multiselect } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";

export type TrackEnvResult = "tracked" | "cancelled" | "error";

const SKIP_DIRS = new Set([".git", "node_modules", "nspt", "dist", "build", ".next", ".cache"]);

function isEnvFileName(name: string): boolean {
  if (name === ".env.example") return false;
  return name === ".env" || name.startsWith(".env.");
}

export function findEnvFiles(root: string = process.cwd()): string[] {
  const results: string[] = [];

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && isEnvFileName(entry.name)) {
        results.push(full);
      }
    }
  };

  walk(root);
  return results.sort();
}

export async function runTrackEnv(groupName?: string): Promise<TrackEnvResult> {
  const groupProvided = Boolean(groupName);
  let groupAuto = false;

  while (true) {
    if (!groupName || !groupName.trim()) {
      const choice = await chooseGroup("Which group do you want to track .env files in?");
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

    const envFiles = findEnvFiles();
    if (envFiles.length === 0) {
      p.log.error("No .env files found in this repo.");
      return "error";
    }

    const relativeOf = (file: string) =>
      path.relative(process.cwd(), file).split(path.sep).join("/");

    const selected = await multiselect({
      message: `Select the .env files to track in "${groupName}":`,
      options: envFiles.map((file) => {
        const relative = relativeOf(file);
        return { value: relative, label: relative };
      }),
      initialValues: envFiles.map(relativeOf),
      required: false,
    });

    if (isBack(selected)) {
      if (groupProvided || groupAuto) return "cancelled";
      groupName = undefined;
      continue;
    }

    if (selected.length === 0) {
      p.log.info("Nothing tracked.");
      return "cancelled";
    }

    const addedPaths: string[] = [];
    const duplicatePaths: string[] = [];

    for (const relative of selected) {
      const name = deriveName(relative);
      const added = addFileToGroupConfig(groupName, { name, path: relative });
      if (added) {
        addedPaths.push(relative);
      } else {
        duplicatePaths.push(relative);
      }
    }

    if (addedPaths.length > 0) {
      p.log.success(`Tracked ${addedPaths.length} .env file(s) in "${groupName}".`);
    }

    if (duplicatePaths.length > 0) {
      p.log.info(`${duplicatePaths.length} already tracked (skipped).`);
    }

    if (addedPaths.length === 0 && duplicatePaths.length > 0) {
      p.log.error("All selected .env files are already tracked.");
      return "error";
    }

    return addedPaths.length > 0 ? "tracked" : "error";
  }
}
