import type { Command } from "commander";
import { runSync } from "../flows/sync_flow.js";

export default function sync(program: Command) {
  program
    .command("sync [group]")
    .description("Decrypt files for a group")
    .action(async (group?: string) => {
      const result = await runSync(group);
      if (result === "error") process.exit(1);
    });
}
