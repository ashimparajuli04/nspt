import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { addFileToGroupConfig, deriveName, listGroups } from "../core/files.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { verifyGroupMembership } from "../core/unwrap.js";
import { passphraseProvider } from "./passphrase.js";
import { select, confirm, isBack } from "../core/ui/prompt.js";

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

  while (true) {
    if (!groupName || !groupName.trim()) {
      const groups = listGroups();
      if (groups.length === 0) {
        p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
        return "error";
      }

      const value = await select({
        message: "Which group do you want to track .env files in?",
        options: groups.map((group) => ({ value: group, label: group })),
      });

      if (isBack(value)) return "cancelled";

      groupName = value;
    }

    const configPath = path.join(process.cwd(), "nspt", groupName, "config.toml");
    if (!fs.existsSync(configPath)) {
      p.log.error(`Group "${groupName}" doesn't exist. Create it with 'nspt create-group ${groupName}'.`);
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
          : `You are not a member of "${groupName}". Only members can track files.`
      );
      return "error";
    }
    s.clear();

    const envFiles = findEnvFiles();
    if (envFiles.length === 0) {
      p.log.error("No .env files found in this repo.");
      return "error";
    }

    p.log.info(`Found ${envFiles.length} .env file(s):`);
    for (const file of envFiles) {
      const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
      p.log.info(`  ${relative}`);
    }

    const confirmed = await confirm({
      message: `Track these ${envFiles.length} .env file(s) in "${groupName}"?`,
      initialValue: true,
    });

    if (isBack(confirmed)) {
      if (groupProvided) return "cancelled";
      groupName = undefined;
      continue;
    }

    if (!confirmed) {
      p.log.info("Nothing tracked.");
      return "cancelled";
    }

    const addedPaths: string[] = [];
    const duplicatePaths: string[] = [];

    for (const file of envFiles) {
      const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
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
      p.log.error("All .env files in this repo are already tracked.");
      return "error";
    }

    return addedPaths.length > 0 ? "tracked" : "error";
  }
}
