import type { Command } from "commander";
import { runAdd } from "../flows/add_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function add(program: Command) {
  program
    .command("add [group] [username]")
    .description("Add a user to a group")
    .action(async (group?: string, username?: string) => {
      await runCliAction(() => runAdd(group, username));
    });
}
