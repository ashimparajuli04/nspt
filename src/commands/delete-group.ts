import type { Command } from "commander";
import { runDeleteGroup } from "../flows/delete_group_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function deleteGroup(program: Command) {
  program
    .command("delete-group [group]")
    .description("Permanently delete a group and all its encrypted files")
    .action(async (group?: string) => {
      await runCliAction(() => runDeleteGroup(group));
    });
}
