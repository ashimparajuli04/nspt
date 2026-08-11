#!/usr/bin/env node
import { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import path from "node:path";
import { runInit } from "./flows/init_flow.js";
import init from "./commands/init.js";
import { runCreateGroup } from "./flows/create_group_flow.js";
import { runTrack } from "./flows/track_flow.js";
import { runTrackEnv } from "./flows/track_env_flow.js";
import { runUntrack } from "./flows/untrack_flow.js";
import { pressAnyKey } from "./core/press_any_key.js";
import createGroup from "./commands/create-group.js";
import track from "./commands/track.js";
import trackEnv from "./commands/track-env.js";
import untrack from "./commands/untrack.js";
import syncUp from "./commands/sync-up.js";
import sync from "./commands/sync.js";
import add from "./commands/add.js";
import updateKeys from "./commands/update-keys.js";

const program = new Command();

program
  .name("nspt")
  .description("Secure, serverless .env sync for teams")
  .version("1.0.0")
  .showHelpAfterError();

init(program);
createGroup(program);
track(program);
trackEnv(program);
untrack(program);
syncUp(program);
sync(program);
add(program);
updateKeys(program);

program.hook("preAction", (_thisCommand, actionCommand) => {
  const name = actionCommand.name();
  if (name === "init" || name === program.name()) return;
  if (!fs.existsSync(path.join(process.cwd(), "nspt"))) {
    p.log.error("nspt not initialized. Run 'nspt init' first.");
    process.exit(1);
  }
});

program.action(async () => {
  p.intro("Welcome to nspt");
  while (true) {
    const initialized = fs.existsSync(path.join(process.cwd(), "nspt"));

    const action = await p.select({
      message: "What would you like to do?",
      options: [
        ...(initialized
          ? [
              { value: "track", label: "Track a file" },
              { value: "track_env", label: "Track all .env files" },
              { value: "untrack", label: "Untrack a file" },
              { value: "create_group", label: "Create a new group" },
              { value: "sync_up", label: "Sync up (encrypt)" },
              { value: "sync", label: "Sync (decrypt)" },
              { value: "add", label: "Add a user to a group" },
              { value: "update_keys", label: "Update keys for a group" },
            ]
          : [
              { value: "initialize", label: "Initialize nspt in this directory" },
            ]),
        { value: "quit", label: "Quit" },
      ],
    });

    if (p.isCancel(action)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    try {
      switch (action) {
        case "initialize":
          await runInit();
          break;
        case "create_group":
          await runCreateGroup();
          break;
        case "track":
          await runTrack();
          break;
        case "track_env":
          await runTrackEnv();
          break;
        case "untrack":
          await runUntrack();
          break;
        case "sync_up": {
          const { runSyncUp } = await import("./flows/sync_up_flow.js");
          await runSyncUp();
          break;
        }
        case "sync": {
          const { runSync } = await import("./flows/sync_flow.js");
          await runSync();
          break;
        }
        case "add": {
          const { runAdd } = await import("./flows/add_flow.js");
          await runAdd();
          break;
        }
        case "update_keys": {
          const { runUpdateKeys } = await import("./flows/update_keys_flow.js");
          await runUpdateKeys();
          break;
        }
        case "quit":
          p.outro("Goodbye!");
          process.exit(0);
        default:
          p.cancel("Unknown action.");
          process.exit(1);
      }
    } catch (err) {
      p.log.error(`Unexpected error: ${(err as Error).message}`);
    }

    await pressAnyKey();
  }
});

program.parse();
