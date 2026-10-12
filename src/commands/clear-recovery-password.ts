import type { Command } from "commander";
import { runClearRecoveryPassword } from "../flows/recovery_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function clearRecoveryPassword(program: Command) {
  program
    .command("clear-recovery-password")
    .description("Forget the recovery password on this machine")
    .action(async () => {
      await runCliAction(() => runClearRecoveryPassword());
    });
}
