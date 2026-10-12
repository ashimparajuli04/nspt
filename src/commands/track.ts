import type { Command } from "commander";
import { runTrack } from "../flows/track_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function track(program: Command) {
  program
    .command("track [group] [filepath]")
    .description("Track files in a group")
    .action(async (group?: string, filepath?: string) => {
      await runCliAction(() => runTrack(group, filepath));
    });
}
