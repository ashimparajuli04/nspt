import type { Command } from "commander";
import { runRotateKey } from "../flows/rotate_key_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function rotateKey(program: Command) {
  program
    .command("rotate-key [group]")
    .description("Rotate the group file key and re-wrap it for all members")
    .action(async (group?: string) => {
      await runCliAction(() => runRotateKey(group));
    });
}
