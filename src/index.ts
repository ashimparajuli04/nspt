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
import { select, isBack, BACK } from "./core/ui/prompt.js";
import { menuSelect } from "./core/ui/menu.js";
import { hasLocalEd25519Key } from "./core/ssh_keys.js";
import { generateHelp } from "./core/platform.js";

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

program.hook("preAction", async (_thisCommand, actionCommand) => {
  const name = actionCommand.name();
  if (name === "init" || name === program.name()) return;
  if (!fs.existsSync(path.join(process.cwd(), "nspt"))) {
    p.log.error("nspt not initialized. Run 'nspt init' first.");
    process.exit(1);
  }
  if (!(await hasLocalEd25519Key())) {
    p.log.error(generateHelp());
    process.exit(1);
  }
});

type MenuOption = { value: string; label: string };

const FILE_MENU: MenuOption[] = [
  { value: "track", label: "Track a file" },
  { value: "untrack", label: "Untrack a file" },
  { value: "track_env", label: "Track all .env files" },
];

const GROUP_MENU: MenuOption[] = [
  { value: "add", label: "Add a user" },
  { value: "remove", label: "Remove a user" },
  { value: "update_keys", label: "Refresh Public keys" },
  { value: "create_group", label: "Create a new group" },
  { value: "delete_group", label: "Delete a group" },
];

const SECURITY_MENU: MenuOption[] = [
  { value: "rotate_key", label: "Rotate the file key" },
];

async function runFlow(action: string): Promise<string | undefined> {
  if (!(await hasLocalEd25519Key())) {
    p.log.error(generateHelp());
    return "error";
  }

  switch (action) {
    case "initialize":
      return runInit();
    case "create_group":
      return runCreateGroup();
    case "delete_group": {
      const { runDeleteGroup } = await import("./flows/delete_group_flow.js");
      return runDeleteGroup();
    }
    case "track":
      return runTrack();
    case "track_env":
      return runTrackEnv();
    case "untrack":
      return runUntrack();
    case "push": {
      const { runEncrypt } = await import("./flows/encrypt_flow.js");
      return runEncrypt();
    }
    case "pull": {
      const { runDecrypt } = await import("./flows/decrypt_flow.js");
      return runDecrypt();
    }
    case "diff": {
      const { runDiff } = await import("./flows/diff_flow.js");
      return runDiff();
    }
    case "add": {
      const { runAdd } = await import("./flows/add_flow.js");
      return runAdd();
    }
    case "update_keys": {
      const { runUpdateKeys } = await import("./flows/update_keys_flow.js");
      return runUpdateKeys();
    }
    case "rotate_key": {
      const { runRotateKey } = await import("./flows/rotate_key_flow.js");
      return runRotateKey();
    }
    case "remove": {
      const { runRemove } = await import("./flows/remove_flow.js");
      return runRemove();
    }
    default:
      p.cancel("Unknown action.");
      process.exit(1);
  }
}

async function runFlowWithPause(action: string): Promise<void> {
  let result: string | undefined;
  try {
    result = await runFlow(action);
  } catch (err) {
    p.log.error(`Unexpected error: ${(err as Error).message}`);
  }
  if (result !== "cancelled") {
    await pressAnyKey();
  }
}

async function runSubmenu(message: string, options: MenuOption[]): Promise<void> {
  while (true) {
    const action = await menuSelect<string | typeof BACK>({
      message,
      options: [{ value: BACK, label: "Back", icon: "◀" }, ...options],
      initialValue: options[0]?.value,
    });
    if (isBack(action)) return;
    await runFlowWithPause(action);
  }
}

program.action(async () => {
  if (!(await hasLocalEd25519Key())) {
    p.log.error(generateHelp());
    process.exit(1);
  }
  p.intro("Welcome to nspt");
  while (true) {
    const initialized = fs.existsSync(path.join(process.cwd(), "nspt"));

    const action = await select({
      message: "What would you like to do?",
      options: [
        ...(initialized
          ? [
              { value: "push", label: "Push" },
              { value: "pull", label: "Pull" },
              { value: "diff", label: "Preview decrypt" },
              { value: "manage_files", label: "Manage Files" },
              { value: "manage_group", label: "Manage Group" },
              { value: "security", label: "Security" },
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

    switch (action) {
      case "quit":
        p.outro("Goodbye!");
        process.exit(0);
      case "manage_files":
        await runSubmenu("Manage Files", FILE_MENU);
        break;
      case "manage_group":
        await runSubmenu("Manage Group", GROUP_MENU);
        break;
      case "security":
        await runSubmenu("Security", SECURITY_MENU);
        break;
      default:
        await runFlowWithPause(action);
    }
  }
});

program.parse();
