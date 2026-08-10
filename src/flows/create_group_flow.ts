import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { createFolder, createGroupConfig } from "../core/files.js";

export type CreateGroupResult = "created" | "cancelled" | "error";

export async function runCreateGroup(groupName?: string): Promise<CreateGroupResult> {
  if (!groupName || !groupName.trim()) {
    const value = await p.text({
      message: "Enter a name for your group:",
      placeholder: "e.g. ilovenspt",
      validate: (value: string | undefined) => {
        if (!value || !value.trim()) return "Group name can't be empty";
        if (fs.existsSync(path.join(process.cwd(), "nspt", value.trim()))) {
          return "Group already exists, please pick another name";
        }
      },
    });

    if (p.isCancel(value)) {
      p.cancel("Cancelled.");
      return "cancelled";
    }

    groupName = value;
  }

  const groupPath = path.join(process.cwd(), "nspt", groupName);

  if (fs.existsSync(groupPath)) {
    p.log.error(`Group "${groupName}" already exists`);
    return "error";
  }

  try {
    createFolder(groupPath);
    createFolder(path.join(groupPath, "encfiles"));
    createGroupConfig(groupPath, groupName);
    p.log.success(`Created ${groupPath}`);
    return "created";
  } catch (err) {
    p.log.error(`Failed to initialize group: ${(err as Error).message}`);
    return "error";
  }
}