import { getVerifiedUsername } from "../identity.js";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import path from "node:path";
import { createGroupStructure } from "../files.js";
import { runCreateGroup } from "./create_group_flow.js";

export async function runInit(): Promise<void> {
  const s = p.spinner();
  s.start("Checking your GitHub identity...");

  const username = await getVerifiedUsername(async () => {
    s.stop();
    const value = await p.text({ message: "Enter your GitHub username:" });
    if (p.isCancel(value)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    return value as string;
  });

  s.stop(`Hi ${username}!`);
  runCreateGroup()
  
}