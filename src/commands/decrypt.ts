import type { Command } from "commander";
import { runDecrypt } from "../flows/decrypt_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function decrypt(program: Command) {
  program
    .command("decrypt [group]")
    .description("Decrypt files for a group")
    .action(async (group?: string) => {
      await runCliAction(() => runDecrypt(group));
    });
}
