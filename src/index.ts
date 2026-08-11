#!/usr/bin/env node
import { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
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
import push from "./commands/push.js";
import pull from "./commands/pull.js";
import add from "./commands/add.js";
import updateKeys from "./commands/update-keys.js";
import rotateKey from "./commands/rotate-key.js";
import remove from "./commands/remove.js";
import deleteGroup from "./commands/delete-group.js";
import diff from "./commands/diff.js";
import { select, isBack } from "./core/ui/prompt.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("nspt")
  .description("Secure, serverless .env sync for teams")
  .version(version)
  .showHelpAfterError();

init(program);
createGroup(program);
track(program);
trackEnv(program);
untrack(program);
push(program);
pull(program);
add(program);
updateKeys(program);
rotateKey(program);
remove(program);
deleteGroup(program);
diff(program);

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

    const action = await select({
      message: "What would you like to do?",
      options: [
        ...(initialized
          ? [
              { value: "track", label: "Track a file" },
              { value: "track_env", label: "Track all .env files" },
              { value: "untrack", label: "Untrack a file" },
              { value: "create_group", label: "Create a new group" },
              { value: "delete_group", label: "Delete a group" },
              { value: "push", label: "Push (encrypt) tracked files" },
              { value: "pull", label: "Pull (decrypt) tracked files" },
              { value: "diff", label: "Preview decrypt (diff)" },
              { value: "add", label: "Add a user to a group" },
              { value: "update_keys", label: "Update keys for a group" },
              { value: "rotate_key", label: "Rotate the file key for a group" },
              { value: "remove", label: "Remove a user from a group" },
            ]
          : [
              { value: "initialize", label: "Initialize nspt in this directory" },
            ]),
        { value: "quit", label: "Quit" },
      ],
    });

    if (isBack(action)) {
      p.outro("Goodbye!");
      process.exit(0);
    }

    let result: string | undefined;

    try {
      switch (action) {
        case "initialize":
          result = await runInit();
          break;
        case "create_group":
          result = await runCreateGroup();
          break;
        case "delete_group": {
          const { runDeleteGroup } = await import("./flows/delete_group_flow.js");
          result = await runDeleteGroup();
          break;
        }
        case "track":
          result = await runTrack();
          break;
        case "track_env":
          result = await runTrackEnv();
          break;
        case "untrack":
          result = await runUntrack();
          break;
        case "push": {
          const { runEncrypt } = await import("./flows/encrypt_flow.js");
          result = await runEncrypt();
          break;
        }
        case "pull": {
          const { runDecrypt } = await import("./flows/decrypt_flow.js");
          result = await runDecrypt();
          break;
        }
        case "diff": {
          const { runDiff } = await import("./flows/diff_flow.js");
          result = await runDiff();
          break;
        }
        case "add": {
          const { runAdd } = await import("./flows/add_flow.js");
          result = await runAdd();
          break;
        }
        case "update_keys": {
          const { runUpdateKeys } = await import("./flows/update_keys_flow.js");
          result = await runUpdateKeys();
          break;
        }
        case "rotate_key": {
          const { runRotateKey } = await import("./flows/rotate_key_flow.js");
          result = await runRotateKey();
          break;
        }
        case "remove": {
          const { runRemove } = await import("./flows/remove_flow.js");
          result = await runRemove();
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

    if (result !== "cancelled") {
      await pressAnyKey();
    }
  }
});

program.parse();
