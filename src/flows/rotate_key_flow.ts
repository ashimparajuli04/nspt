import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { unwrapGroupKeyDetailed } from "../core/unwrap.js";
import { rotateGroupKey } from "../core/rotate.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { passphraseProvider } from "./passphrase.js";
import { confirm, isBack, withEscInert } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";

export type RotateKeyResult = "rotated" | "cancelled" | "error";

export async function runRotateKey(groupName?: string): Promise<RotateKeyResult> {
  const groupProvided = Boolean(groupName);
  let groupAuto = false;

  while (true) {
    if (!groupName || !groupName.trim()) {
      const choice = await chooseGroup("Which group do you want to rotate the file key for?");
      if (choice === null) return "error";
      if (isBack(choice)) return "cancelled";
      groupName = choice.group;
      groupAuto = choice.auto;
    }

    const groupPath = path.join(process.cwd(), "nspt", groupName);
    if (!fs.existsSync(groupPath)) {
      p.log.error(`Group "${groupName}" doesn't exist.`);
      return "error";
    }

    const confirmed = await confirm({
      message:
        `Rotating the file key for "${groupName}" re-encrypts all tracked files and ` +
        "re-wraps the key for every member. Old wraps become useless. Continue?",
      initialValue: false,
    });

    if (isBack(confirmed)) {
      if (groupProvided || groupAuto) return "cancelled";
      groupName = undefined;
      continue;
    }

    if (!confirmed) {
      p.log.info("Nothing rotated.");
      return "cancelled";
    }

    const s = p.spinner();
    s.start("Unwrapping group key...");

    const unlocked = await unwrapGroupKeyDetailed(groupName, { getPassphrase: passphraseProvider(s), allowRecoveryWrite: true });
    const oldFileKey = unlocked?.fileKey;
    if (!oldFileKey) {
      s.stop("Failed");
      const hint = await localKeyUnlockHint();
      p.log.error(
        hint
          ? `Could not unwrap group key.\n${hint}`
          : "Could not unwrap group key. Only members can rotate the key."
      );
      return "error";
    }

    s.clear();

    s.start("Rotating file key...");
    try {
      const activeGroup: string = groupName;
      await withEscInert(async () => {
        await rotateGroupKey(activeGroup, oldFileKey, (msg) => {
          s.message(msg);
        }, [], unlocked?.username);
      });
      s.stop("File key rotated");
      p.log.success(`Rotated the file key for group "${groupName}"`);
      return "rotated";
    } catch (err) {
      s.stop("Failed");
      p.log.error(`Rotation failed: ${(err as Error).message}`);
      return "error";
    }
  }
}
