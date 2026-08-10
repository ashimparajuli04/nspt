import type { Command } from "commander";
import { runTrack } from "../flows/track_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function track(program: Command) {
  program
    .command("track <groupName> <filepath>")
    .description("Track files in a group")
    .action(async (groupName: string, filepath: string) => {
      await runCliAction(() => runTrack(groupName, filepath));
    });
}
