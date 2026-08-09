import type { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import { createGroupStructure } from "../core/files.js";
import { getVerifiedUsername } from "../core/identity.js";
import path from "node:path";

export default function init(program: Command) {
  program
    .command("init")
    .description("Initialize a new nspt group")
    .action(async () => {
      const s = p.spinner();
      s.start("Checking your GitHub identity...");

      const username = await getVerifiedUsername(async () => {
        s.stop();
        const value = await p.text({ message: "Enter your GitHub username:" });
        if (p.isCancel(value)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        return value as string;
      });

      s.stop(`Hi ${username}!`);

      const groupName = await p.text({
        message: "Enter a name for your group:",
        placeholder: "e.g. ilovenspt",
        validate: (value: string | undefined) => {
          if (!value || !value.trim()) return "Group name can't be empty";
          if (fs.existsSync(path.join(process.cwd(), "nspt", value.trim()))) {
            return "Group already exists, please pick another name";
          }
        },
      });

      if (p.isCancel(groupName)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }

      const groupPath = path.join(process.cwd(), "nspt", groupName);

      try {
        createGroupStructure(groupPath, groupName);
        p.log.success(`Created ${groupPath}`);
      } catch (err) {
        p.log.error(`Failed to initialize group: ${(err as Error).message}`);
      }
    });
}
