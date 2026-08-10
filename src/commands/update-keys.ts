import type { Command } from "commander";
import { runUpdateKeys } from "../flows/update_keys_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function updateKeys(program: Command) {
  program
    .command("update-keys [group]")
    .description("Re-fetch GitHub keys for all members and add missing wraps")
    .action(async (group?: string) => {
      await runCliAction(() => runUpdateKeys(group));
    });
}
