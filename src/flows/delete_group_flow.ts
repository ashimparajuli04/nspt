import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { listGroups, deleteGroup } from "../core/files.js";
import { removeStoredIdentity } from "../core/age_store.js";

export type DeleteGroupResult = "deleted" | "cancelled" | "error";

export async function runDeleteGroup(groupName?: string): Promise<DeleteGroupResult> {
  if (!groupName || !groupName.trim()) {
    const groups = listGroups();
    if (groups.length === 0) {
      p.log.error("No groups yet.");
      return "error";
    }

    const value = await p.select({
      message: "Which group do you want to delete?",
      options: groups.map((group) => ({ value: group, label: group })),
    });

    if (p.isCancel(value)) {
      p.cancel("Cancelled.");
      return "cancelled";
    }

    groupName = value;
  }

  const groupPath = path.join(process.cwd(), "nspt", groupName);
  if (!fs.existsSync(groupPath)) {
    p.log.error(`Group "${groupName}" doesn't exist.`);
    return "error";
  }

  const confirmed = await p.confirm({
    message:
      `Delete group "${groupName}"? This permanently removes all encrypted files ` +
      "and user keys for this group. Continue?",
    initialValue: false,
  });

  if (p.isCancel(confirmed)) {
    p.cancel("Cancelled.");
    return "cancelled";
  }

  if (!confirmed) {
    p.log.info("Nothing deleted.");
    return "cancelled";
  }

  const typed = await p.text({
    message: `Type the group name "${groupName}" to confirm deletion:`,
    placeholder: groupName,
    validate: (value: string | undefined) => {
      if ((value ?? "").trim() !== groupName) {
        return "Group name doesn't match. Type it exactly.";
      }
    },
  });

  if (p.isCancel(typed)) {
    p.cancel("Cancelled.");
    return "cancelled";
  }

  deleteGroup(groupName);
  removeStoredIdentity(groupName);
  p.log.success(`Deleted group "${groupName}"`);
  return "deleted";
}
