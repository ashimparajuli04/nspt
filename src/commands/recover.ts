import type { Command } from "commander";
import { runRecover } from "../flows/recover_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function recover(program: Command) {
  program
    .command("recover [group]")
    .description("Unlock a group with the recovery password (no SSH key required)")
    .action(async (group?: string) => {
      await runCliAction(() => runRecover(group));
    });
}
