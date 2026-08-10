import { getVerifiedUsername } from "../core/identity.js";
import { createFolder } from "../core/files.js";
import { discoverLocalKeys, tallyKeys } from "../core/ssh_keys.js";
import * as p from "@clack/prompts";
import path from "node:path";
import { runCreateGroup } from "./create_group_flow.js";

export async function runInit(): Promise<void> {
  const s = p.spinner();
  s.start("Checking your GitHub identity...");

  const username = await getVerifiedUsername();

  if (!username) {
    s.stop("Could not detect GitHub identity.");
    p.log.error(
      "Make sure you have SSH access to GitHub configured. See https://docs.github.com/en/authentication/connecting-to-github-with-ssh"
    );
    return;
  }

  s.stop(`Authenticated as ${username}`);

  s.start("Discovering local SSH keys...");
  const localKeys = await discoverLocalKeys();
  s.stop(
    localKeys.length > 0
      ? `Found ${localKeys.length} local key(s)`
      : "No local SSH keys found"
  );

  if (localKeys.length === 0) {
    p.log.warn(
      "No SSH keys found in ~/.ssh/. Generate one with: ssh-keygen -t ed25519"
    );
  } else {
    s.start("Tallying with GitHub keys...");
    const { matched, github } = await tallyKeys(username);
    s.stop(
      `Matched ${matched.length}/${github.length} GitHub key(s) locally`
    );

    if (matched.length === 0 && github.length > 0) {
      p.log.warn(
        "None of your local keys match your GitHub keys. Add your public key to GitHub or generate a new one."
      );
    }

    if (localKeys.length > 0) {
      p.log.info("Your local SSH keys:");
      for (const k of localKeys) {
        const status = matched.includes(k) ? "✓ on GitHub" : "✗ not on GitHub";
        const label = k.comment ?? k.source;
        p.log.message(`  ${k.type} ${label} (${status})`);
      }
    }
  }

  createFolder(path.join(process.cwd(), "nspt"));
  await runCreateGroup();
}
