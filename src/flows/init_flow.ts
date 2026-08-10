import { runPreflight } from "../core/preflight.js";
import { createFolder } from "../core/files.js";
import { GithubRateLimitError } from "../core/github.js";
import * as p from "@clack/prompts";
import path from "node:path";
import { homedir } from "node:os";
import { runCreateGroup } from "./create_group_flow.js";

const SSH_DIR = path.join(homedir(), ".ssh");

export async function runInit(): Promise<void> {
  const s = p.spinner();
  s.start("Verifying identity and keys...");

  let result;
  try {
    result = await runPreflight();
  } catch (err) {
    if (err instanceof GithubRateLimitError) {
      s.stop("Rate limited");
      p.log.error(err.message);
      return;
    }
    throw err;
  }

  if (!result) {
    s.stop("Preflight failed.");
    p.log.error(
      "Could not verify identity. Ensure you have:\n" +
        "  - SSH access to GitHub configured\n" +
        "  - At least one ssh-ed25519 key on GitHub\n" +
        `  - A matching local SSH key in ${SSH_DIR}/`
    );
    return;
  }

  s.stop(`Authenticated as ${result.username}`);

  createFolder(path.join(process.cwd(), "nspt"));
  await runCreateGroup();
}
