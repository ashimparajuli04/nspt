import type { Command } from "commander";
import { runChangeRecoveryPassword } from "../flows/recovery_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function changeRecoveryPassword(program: Command) {
  program
    .command("change-recovery-password")
    .description("Rotate the recovery password and re-wrap this repo's entries")
    .action(async () => {
      await runCliAction(() => runChangeRecoveryPassword());
    });
}
