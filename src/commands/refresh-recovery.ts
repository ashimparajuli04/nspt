import type { Command } from "commander";
import { runRefreshRecoveryPassword } from "../flows/recovery_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function refreshRecovery(program: Command) {
  program
    .command("refresh-recovery [group]")
    .description("Re-seal this repo's recovery entries under the current file key")
    .action(async (group?: string) => {
      await runCliAction(() => runRefreshRecoveryPassword(group));
    });
}
