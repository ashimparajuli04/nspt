import type { Command } from "commander";

export default function init(program: Command) {
  program
    .command("init")
    .description("Initialize a new nspt group")
    .action(() => {
      console.log("hello");
    });
}