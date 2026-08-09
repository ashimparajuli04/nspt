import type { Command } from "commander";
import * as p from "@clack/prompts";
import { createGroupStructure } from "../core/files.js";
import path from "node:path";

export default function init(program: Command) {
  program
    .command("init")
    .description("Initialize a new nspt group")
    .action(async() => {
      
      // p.intro("nspt");
      
      const groupName = await p.text({
        message: "Enter a name for your group:",
        placeholder: "e.g. ilovenspt",
        validate: (value: string | undefined) => {
          if (!value ||!value.trim()) return "Username can't be empty";
        },
      });

      if (p.isCancel(groupName)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      const groupPath = path.join(process.cwd(), "nspt", groupName);
      
      try {
        createGroupStructure(groupPath, groupName)
        p.log.success(`Created ${groupPath}`);
      } catch (err) {
        p.log.error(`Failed to create folder: ${(err as Error).message}`);
      }

      // const action = await p.select({
      //   message: `What do you want to do, ${username}?`,
      //   options: [
      //     { value: "create-group", label: "Create group" },
      //     { value: "add-user", label: "Add user" },
      //   ],
      // });

      // if (p.isCancel(action)) {
      //   p.cancel("Cancelled.");
      //   process.exit(0);
      // }

      // // Not wired up yet — just confirming the selection for now
      // p.outro(`You picked: ${action}`);
    });
}