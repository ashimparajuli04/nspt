#!/usr/bin/env node
import { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import path from "node:path";
import { runInit } from "./core/flow/init_flow.js";
import init from "./commands/init.js";
import { runCreateGroup } from "./core/flow/create_group_flow.js";


const program = new Command();

program
  .name("nspt")
  .description("Secure, serverless .env sync for teams")
  .version("0.0.1");

init(program);

program.action(async () => {
  p.intro("Welcome to nspt")
  var initialized : boolean = false
  if (fs.existsSync(path.join(process.cwd(), "nspt"))) {
    initialized = true
  }

  const action = await p.select({
    message: "What would you like to do?",
    options: [...(initialized ? [{ value: "create_group", label: "Create a new group" }] : [{ value: "initialize", label: "Initialize nspt in this directory" }]),
      { value: "quit", label: "Quit" },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  
  if (action === "initialize") {
    await runInit();
  }

  if (action === "quit") {
    p.outro("Goodbye!");
    process.exit(0);
  }

  if (action === "create_group") {
    await runCreateGroup();
  }
});

program.parse();