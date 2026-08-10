import type { Command } from "commander";
import { runSyncUp } from "../flows/sync_up_flow.js";

export default function syncUp(program: Command) {
  program
    .command("sync-up [group]")
    .description("Encrypt all tracked files for a group")
    .action(async (group?: string) => {
      const result = await runSyncUp(group);
      if (result === "error") process.exit(1);
    });
}
