import type { Command } from "commander";
import { runCreateGroup } from "../flows/create_group_flow.js";
import { runCliAction } from "../core/cli_action.js";


export default function createGroup(program: Command) {
  program
    .command("create-group <name>")
    .description("Create a new group")
    .action(async (name: string) => {
      await runCliAction(() => runCreateGroup(name));
    });
}
