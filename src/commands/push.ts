import type { Command } from "commander";
import { runEncrypt } from "../flows/encrypt_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function push(program: Command) {
  program
    .command("push [group]")
    .description("Encrypt all tracked files for a group")
    .action(async (group?: string) => {
      await runCliAction(() => runEncrypt(group));
    });
}
