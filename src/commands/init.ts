import type { Command } from "commander";
import { randomBytes } from "node:crypto";

export default function init(program: Command) {
  program
    .command("init")
    .description("Initialize a new nspt group")
    .action(() => {
      // const key = randomBytes(32).toString("hex")
      // console.log(key)
      
    });
}