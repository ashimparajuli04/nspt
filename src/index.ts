#!/usr/bin/env node
import { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import path from "node:path";
import { runInit } from "./flows/init_flow.js";
import init from "./commands/init.js";
import { runCreateGroup } from "./flows/create_group_flow.js";
import { runTrack } from "./flows/track_flow.js";
import { pressAnyKey } from "./core/press_any_key.js";
import createGroup from "./commands/create-group.js";
import track from "./commands/track.js";

const program = new Command();

program
  .name("nspt")
  .description("Secure, serverless .env sync for teams")
  .version("0.0.1")
  .showHelpAfterError();

init(program);
createGroup(program);
track(program);

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
              { value: "create_group", label: "Create a new group" },
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
      case "quit":
        p.outro("Goodbye!");
        process.exit(0);
      default:
        p.cancel("Unknown action.");
        process.exit(1);
    }

    await pressAnyKey();
  }
});

program.parse();
