import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { readDecryptedFile } from "../core/enc_dec_file.js";
import { unwrapGroupKey } from "../core/unwrap.js";
import { listTrackedFiles } from "../core/files.js";
import { renderUnifiedDiff, createDiffStyler, diffSummary } from "../core/diff.js";
import { localKeyUnlockHint } from "../core/ssh_keys.js";
import { passphraseProvider } from "./passphrase.js";
import { select, isBack } from "../core/ui/prompt.js";
import { chooseGroup } from "../core/ui/group.js";

export type DiffResult = "shown" | "cancelled" | "error";

const ALL_FILES = "__all__";

export async function runDiff(groupName?: string): Promise<DiffResult> {
  const groupProvided = Boolean(groupName);
  let groupAuto = false;

  while (true) {
    if (!groupName || !groupName.trim()) {
      const choice = await chooseGroup("Which group do you want to preview a decrypt for?");
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

    const s = p.spinner();
    s.start("Unwrapping group key...");

    const fileKey = await unwrapGroupKey(groupName, { getPassphrase: passphraseProvider(s) });
    if (!fileKey) {
      s.stop("Failed");
      const hint = await localKeyUnlockHint();
      p.log.error(
        hint
          ? `Could not unwrap group key.\n${hint}`
          : "Could not unwrap group key. Are you a member of this group?"
      );
      return "error";
    }

    s.clear();

    const files = listTrackedFiles(groupName);
    if (files.length === 0) {
      p.log.error(`No tracked files in "${groupName}".`);
      return "error";
    }

    const value = await select({
      message: "Which file do you want to preview?",
      options: [
        { value: ALL_FILES, label: "All tracked files" },
        ...files.map((f) => ({ value: f.name, label: `${f.name} (${f.path})` })),
      ],
    });

    if (isBack(value)) {
      if (groupProvided || groupAuto) return "cancelled";
      groupName = undefined;
      continue;
    }

    const targets = value === ALL_FILES ? files : files.filter((f) => f.name === value);
    const multiple = targets.length > 1;

    for (const file of targets) {
      let local = "";
      try {
        local = fs.readFileSync(file.path, "utf-8");
      } catch {
        local = "";
      }

      let remote: string;
      try {
        remote = readDecryptedFile(fileKey, groupName, file);
      } catch (err) {
        p.log.error(`Could not preview "${file.path}": ${(err as Error).message}`);
        continue;
      }

      const out = renderUnifiedDiff(file.path, file.path, local, remote);
      const { additions, deletions } = diffSummary(local, remote);

      if (out === null) {
        if (!multiple) p.log.info(`${file.path}: up to date`);
        continue;
      }

      if (multiple) {
        console.log(`\n${createDiffStyler().fileHeader(`=== ${file.path} ===`)}`);
      }
      console.log(out);
      p.log.info(`${file.path}: ${additions} addition(s), ${deletions} deletion(s)`);
    }

    return "shown";
  }
}
