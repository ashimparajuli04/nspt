import type { Command } from "commander";
import { runCreateGroup } from "../flows/create_group_flow.js";
import fs from "fs";
import path from "path";


export default function createGroup(program: Command) {
  program
    .command("create-group <name>")
    .description("Create a new group")
    .action((name: string) => {
      if (!fs.existsSync(path.join(process.cwd(), "nspt"))) {
        console.error("nspt not initialized. Run 'nspt init' first.");
        process.exit(1);
      }
      runCreateGroup(name)
    });
}