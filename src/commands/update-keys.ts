import type { Command } from "commander";
import { runUpdateKeys } from "../flows/update_keys_flow.js";

export default function updateKeys(program: Command) {
  program
    .command("update-keys [group]")
    .description("Re-fetch GitHub keys for all members and add missing wraps")
    .action(async (group?: string) => {
      const result = await runUpdateKeys(group);
      if (result === "error") process.exit(1);
    });
}
