import type { Command } from "commander";
import { runTrack } from "../flows/track_flow.js";

export default function track(program: Command) {
  program
    .command("track <groupName> <filepath>")
    .description("Track files in a group")
    .action(async (groupName: string, filepath: string) => {
      const result = await runTrack(groupName, filepath);
      if (result === "error") process.exit(1);
    });
}
