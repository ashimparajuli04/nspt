import type { Command } from "commander";
import { runDiff } from "../flows/diff_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function diff(program: Command) {
  program
    .command("diff [group]")
    .description("Preview how decrypting would update your tracked files")
    .action(async (group?: string) => {
      await runCliAction(() => runDiff(group));
    });
}
