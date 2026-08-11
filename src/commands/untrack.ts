import type { Command } from "commander";
import { runUntrack } from "../flows/untrack_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function untrack(program: Command) {
  program
    .command("untrack [group]")
    .description("Untrack a file and remove its encrypted copy")
    .action(async (group?: string) => {
      await runCliAction(() => runUntrack(group));
    });
}
