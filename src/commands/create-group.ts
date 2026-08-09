import type { Command } from "commander";
import { runCreateGroup } from "../flows/create_group_flow.js";


export default function createGroup(program: Command) {
  program
    .command("create-group <name>")
    .description("Create a new group")
    .action((name: string) => {
      runCreateGroup(name);
    });
}
