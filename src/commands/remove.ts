import type { Command } from "commander";
import { runRemove } from "../flows/remove_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function remove(program: Command) {
  program
    .command("remove [group] [username]")
    .description("Remove a user from a group and rotate the file key")
    .action(async (group?: string, username?: string) => {
      await runCliAction(() => runRemove(group, username));
    });
}
