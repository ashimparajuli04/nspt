import type { Command } from "commander";
import { runTrackEnv } from "../flows/track_env_flow.js";
import { runCliAction } from "../core/cli_action.js";

export default function trackEnv(program: Command) {
  program
    .command("track-env [group]")
    .description("Track all .env files in the repo for a group")
    .action(async (group?: string) => {
      await runCliAction(() => runTrackEnv(group));
    });
}
