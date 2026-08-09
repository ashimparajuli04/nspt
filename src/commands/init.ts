import type { Command } from "commander";
import { runInit } from "../core/flow/init_flow.js";


export default function init(program: Command) {
  program
    .command("init")
    .description("Initialize a nspt in this directory")
    .action(runInit);
}
