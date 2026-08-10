import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { randomBytes } from "node:crypto";
import { createFolder, createGroupConfig } from "../core/files.js";
import { generateAgeIdentity, sealToFileKey } from "../core/age_keys.js";
import { storeIdentity } from "../core/age_store.js";
import { fetchUserKeys } from "../core/github.js";
import { discoverLocalKeys } from "../core/ssh_keys.js";
import { getVerifiedUsername } from "../core/identity.js";
import { writeUserKeys } from "../core/user_keys.js";

export type CreateGroupResult = "created" | "cancelled" | "error";

function validateGroupName(name: string): string | null {
  if (!name.trim()) return "Group name can't be empty";
  if (name.includes("/") || name.includes("\\")) {
    return "Group name can't contain '/' or '\\'";
  }
  if (name.includes("..")) return "Group name can't contain '..'";
  return null;
}

export async function runCreateGroup(groupName?: string): Promise<CreateGroupResult> {
  if (!groupName || !groupName.trim()) {
    const value = await p.text({
      message: "Enter a name for your group:",
      placeholder: "e.g. ilovenspt",
      validate: (value: string | undefined) => {
        if (!value) return "Group name can't be empty";
        const error = validateGroupName(value.trim());
        if (error) return error;
        if (fs.existsSync(path.join(process.cwd(), "nspt", value.trim()))) {
          return "Group already exists, please pick another name";
        }
      },
    });

    if (p.isCancel(value)) {
      p.cancel("Cancelled.");
      return "cancelled";
    }

    groupName = value.trim();
  }

  const error = validateGroupName(groupName);
  if (error) {
    p.log.error(error);
    return "error";
  }

  const groupPath = path.join(process.cwd(), "nspt", groupName);

  if (fs.existsSync(groupPath)) {
    p.log.error(`Group "${groupName}" already exists`);
    return "error";
  }

  const s = p.spinner();
  s.start("Generating age identity...");

  try {
    const ageIdentity = await generateAgeIdentity();
    const fileKey = randomBytes(32).toString("hex");
    const wrappedResults = await sealToFileKey(fileKey, [ageIdentity.recipient]);
    const wrappedForCreator = wrappedResults[0];
    if (!wrappedForCreator) {
      s.stop("Failed");
      p.log.error("Failed to seal file key");
      return "error";
    }

    const username = (await getVerifiedUsername()) ?? "creator";

    let sshDisplay: string | null = null;
    try {
      const githubKeys = await fetchUserKeys(username);
      sshDisplay = githubKeys.find((k) => k.key.startsWith("ssh-ed25519"))?.key ?? null;
    } catch {
      sshDisplay = null;
    }
    if (!sshDisplay) {
      sshDisplay =
        (await discoverLocalKeys()).find((k) => k.type === "ssh-ed25519")?.key ?? null;
    }

    s.clear();

    createFolder(groupPath);
    createFolder(path.join(groupPath, "encfiles"));
    createGroupConfig(groupPath, groupName);

    storeIdentity(groupName, ageIdentity.identity);

    writeUserKeys(groupPath, {
      key_version: 1,
      users: [
        {
          username,
          keys: [
            {
              age: ageIdentity.recipient,
              ssh: sshDisplay ?? "ssh-ed25519 (local)",
              wrapped: wrappedForCreator,
            },
          ],
        },
      ],
    });

    p.log.success(`Created group "${groupName}"`);
    return "created";
  } catch (err) {
    s.stop("Failed");
    p.log.error(`Failed to create group: ${(err as Error).message}`);
    return "error";
  }
}
