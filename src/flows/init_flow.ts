import { runPreflight } from "../core/preflight.js";
import { createFolder } from "../core/files.js";
import * as p from "@clack/prompts";
import path from "node:path";
import { runCreateGroup } from "./create_group_flow.js";

export async function runInit(): Promise<void> {
  const s = p.spinner();
  s.start("Verifying identity and keys...");

  const result = await runPreflight();

  if (!result) {
    s.stop("Preflight failed.");
    p.log.error(
      "Could not verify identity. Ensure you have:\n" +
        "  - SSH access to GitHub configured\n" +
        "  - At least one ssh-ed25519 key on GitHub\n" +
        "  - A matching local SSH key in ~/.ssh/"
    );
    return;
  }

  s.stop(`Authenticated as ${result.username}`);

  createFolder(path.join(process.cwd(), "nspt"));
  await runCreateGroup();
}
