import { getVerifiedUsername, getCachedUsername } from "../core/identity.js";
import { createFolder } from "../core/files.js";
import * as p from "@clack/prompts";
import path from "node:path";
import { runCreateGroup } from "./create_group_flow.js";


export async function runInit(): Promise<void> {
  const s = p.spinner();
  s.start("Checking your GitHub identity...");

  const username = await getVerifiedUsername();
  const displayName = username ?? getCachedUsername();

  s.stop(displayName ? `Hi ${displayName}!` : "Hi there!");

  createFolder(path.join(process.cwd(), "nspt"));
  await runCreateGroup();
}
