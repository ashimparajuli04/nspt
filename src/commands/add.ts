import type { Command } from "commander";
import { runAdd } from "../flows/add_flow.js";

export default function add(program: Command) {
  program
    .command("add [group] [username]")
    .description("Add a user to a group")
    .action(async (group?: string, username?: string) => {
      const result = await runAdd(group, username);
      if (result === "error") process.exit(1);
    });
}
