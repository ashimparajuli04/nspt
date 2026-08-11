import type { Command } from "commander";
import { runDecrypt } from "../flows/decrypt_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function pull(program: Command) {
  program
    .command("pull [group]")
    .description("Decrypt files for a group")
    .action(async (group?: string) => {
      await runCliAction(() => runDecrypt(group));
    });
}
