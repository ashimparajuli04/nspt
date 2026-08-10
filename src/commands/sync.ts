import type { Command } from "commander";
import { runSync } from "../flows/sync_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function sync(program: Command) {
  program
    .command("sync [group]")
    .description("Decrypt files for a group")
    .action(async (group?: string) => {
      await runCliAction(() => runSync(group));
    });
}
