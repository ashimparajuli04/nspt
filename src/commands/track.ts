import type { Command } from "commander";
import * as fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { addFileToGroupConfig, deriveName } from "../core/files.js";

export default function track(program: Command) {
  program
    .command("track <groupName> <filepath>")
    .description("Track files in a group")
    .action((groupName, filepath) => {
      const configPath = path.join(process.cwd(), "nspt", groupName, "config.toml");
      if (!fs.existsSync(configPath)) {
        p.log.error(`Group "${groupName}" doesn't exist. Create it with 'nspt create-group ${groupName}'.`);
        return;
      }

      if (!fs.existsSync(filepath)) {
        p.log.error(`File "${filepath}" doesn't exist.`);
        return;
      }

      const name = deriveName(filepath);
      const added = addFileToGroupConfig(groupName, { name, path: filepath });

      if (!added) {
        p.log.error(`"${name}" (${filepath}) is already tracked in "${groupName}".`);
        return;
      }

      p.log.success(`Tracked ${filepath} as "${name}" in ${groupName}`);
    });
}
