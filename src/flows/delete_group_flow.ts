import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { listGroups, deleteGroup } from "../core/files.js";
import { removeStoredIdentity } from "../core/age_store.js";
import { select, confirm, text, isBack } from "../core/ui/prompt.js";

export type DeleteGroupResult = "deleted" | "cancelled" | "error";

export async function runDeleteGroup(groupName?: string): Promise<DeleteGroupResult> {
  const groupProvided = Boolean(groupName);

  while (true) {
    if (!groupName || !groupName.trim()) {
      const groups = listGroups();
      if (groups.length === 0) {
        p.log.error("No groups yet.");
        return "error";
      }

      const value = await select({
        message: "Which group do you want to delete?",
        options: groups.map((group) => ({ value: group, label: group })),
      });

      if (isBack(value)) return "cancelled";

      groupName = value;
    }

    const groupPath = path.join(process.cwd(), "nspt", groupName);
    if (!fs.existsSync(groupPath)) {
      p.log.error(`Group "${groupName}" doesn't exist.`);
      return "error";
    }

    while (true) {
      const confirmed = await confirm({
        message:
          `Delete group "${groupName}"? This permanently removes all encrypted files ` +
          "and user keys for this group. Continue?",
        initialValue: false,
      });

      if (isBack(confirmed)) {
        if (groupProvided) return "cancelled";
        groupName = undefined;
        break;
      }

      if (!confirmed) {
        p.log.info("Nothing deleted.");
        return "cancelled";
      }

      const typed = await text({
        message: `Type the group name "${groupName}" to confirm deletion:`,
        placeholder: groupName,
        validate: (value: string | undefined) => {
          if ((value ?? "").trim() !== groupName) {
            return "Group name doesn't match. Type it exactly.";
          }
        },
      });

      if (isBack(typed)) continue;

      deleteGroup(groupName);
      removeStoredIdentity(groupName);
      p.log.success(`Deleted group "${groupName}"`);
      return "deleted";
    }
  }
}
