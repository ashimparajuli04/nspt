import type { Command } from "commander";
import { runSetRecoveryPassword } from "../flows/recovery_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function setRecoveryPassword(program: Command) {
  program
    .command("set-recovery-password")
    .description("Set (or change) the machine-wide recovery password")
    .action(async () => {
      await runCliAction(() => runSetRecoveryPassword());
    });
}
