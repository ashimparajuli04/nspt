import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { createFolder, createGroupConfig } from "../core/files.js";
import { generateAgeIdentity, sealToFileKey } from "../core/age_keys.js";
import { storeIdentity } from "../core/age_store.js";
import { fetchUserKeys } from "../core/github.js";
import { discoverLocalKeys } from "../core/ssh_keys.js";
import { getVerifiedUsername } from "../core/identity.js";
import { writeUserKeys } from "../core/user_keys.js";
import { generateKey } from "../core/enc_dec_file.js";
import { sshIdentityFromFile } from "../core/ssh_to_age.js";

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
  s.start("Generating group key...");

  try {
    const fileKey = generateKey();

    let recipient: string;
    let storedIdentity: string | null = null;
    let sshDisplay: string | null = null;

    const localKeys = await discoverLocalKeys();
    const localEd = localKeys.find((k) => k.type === "ssh-ed25519");

    if (localEd) {
      const id = sshIdentityFromFile(localEd.source);
      if (id) {
        recipient = id.recipient;
        sshDisplay = id.pubLine;
      } else if (localEd.encrypted) {
        p.log.warn(
          `Your SSH key "${path.basename(localEd.source)}" is passphrase-protected. ` +
            "Load it into your agent (ssh-add) or unencrypt it (ssh-keygen -p) and recreate " +
            "this group so you can sync from any machine. Creating now with a stored age " +
            "identity that only works on this machine."
        );
        const ageIdentity = await generateAgeIdentity();
        recipient = ageIdentity.recipient;
        storedIdentity = ageIdentity.identity;
        sshDisplay = `ssh-ed25519 ${localEd.key}`;
      } else {
        const ageIdentity = await generateAgeIdentity();
        recipient = ageIdentity.recipient;
        storedIdentity = ageIdentity.identity;
        sshDisplay = `ssh-ed25519 ${localEd.key}`;
      }
    } else {
      const ageIdentity = await generateAgeIdentity();
      recipient = ageIdentity.recipient;
      storedIdentity = ageIdentity.identity;
    }

    const wrappedResults = await sealToFileKey(fileKey, [recipient]);
    const wrappedForCreator = wrappedResults[0];
    if (!wrappedForCreator) {
      s.stop("Failed");
      p.log.error("Failed to seal file key");
      return "error";
    }

    const username = (await getVerifiedUsername()) ?? "creator";

    if (!sshDisplay) {
      try {
        const githubKeys = await fetchUserKeys(username);
        sshDisplay = githubKeys.find((k) => k.key.startsWith("ssh-ed25519"))?.key ?? null;
      } catch {
        sshDisplay = null;
      }
    }

    s.clear();

    createFolder(groupPath);
    createFolder(path.join(groupPath, "encfiles"));
    createGroupConfig(groupPath, groupName);

    if (storedIdentity) {
      storeIdentity(groupName, storedIdentity);
    }

    writeUserKeys(groupPath, {
      key_version: 1,
      users: [
        {
          username,
          keys: [
            {
              age: recipient,
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
