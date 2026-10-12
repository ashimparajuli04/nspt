import type { Command } from "commander";
import { runStatus } from "../flows/status_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function status(program: Command) {
  program
    .command("status [group]")
    .description("Show tracked files and whether your working copies are in sync")
    .option("--json", "Print machine-readable JSON")
    .action(async (group: string | undefined, options: { json?: boolean }) => {
      await runCliAction(() => runStatus(group, { json: options.json === true }));
    });
}
