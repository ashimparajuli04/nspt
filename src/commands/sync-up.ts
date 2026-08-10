import type { Command } from "commander";
import { runSyncUp } from "../flows/sync_up_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function syncUp(program: Command) {
  program
    .command("sync-up [group]")
    .description("Encrypt all tracked files for a group")
    .action(async (group?: string) => {
      await runCliAction(() => runSyncUp(group));
    });
}
