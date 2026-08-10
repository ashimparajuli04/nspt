import type { Command } from "commander";
import { runInit } from "../flows/init_flow.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";


export default function init(program: Command) {
  program
    .command("init")
    .description("Initialize a nspt in this directory")
    .action(() => {
      if (fs.existsSync(path.join(process.cwd(), "nspt"))) {
        p.log.error("nspt already initialized.");
        process.exit(1);
      }
      runInit();
    });
}
