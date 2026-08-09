import * as fs from "fs";
import * as path from "path";
import * as p from "@clack/prompts";
import { createGroupStructure } from "../files.js";

export async function runCreateGroup() {
  const groupName = await p.text({
    message: "Enter a name for your group:",
    placeholder: "e.g. ilovenspt",
    validate: (value: string | undefined) => {
      if (!value || !value.trim()) return "Group name can't be empty";
      if (fs.existsSync(path.join(process.cwd(), "nspt", value.trim()))) {
        return "Group already exists, please pick another name";
      }
    },
  });

  if (p.isCancel(groupName)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const groupPath = path.join(process.cwd(), "nspt", groupName);

  try {
    createGroupStructure(groupPath, groupName);
    p.log.success(`Created ${groupPath}`);
  } catch (err) {
    p.log.error(`Failed to initialize group: ${(err as Error).message}`);
  }
}