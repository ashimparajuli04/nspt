import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";

const UP = "__nspt_up__";

export async function pickFile(root: string = process.cwd()): Promise<string | null> {
  const stack: string[] = [];
  let current = root;

  while (true) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      p.log.error(`Cannot read directory: ${(err as Error).message}`);
      return null;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const options: { value: string; label: string }[] = [];
    if (stack.length > 0) options.push({ value: UP, label: ".. (go up)" });
    for (const entry of entries) {
      options.push({
        value: path.join(current, entry.name),
        label: entry.isDirectory() ? `${entry.name}/` : entry.name,
      });
    }

    if (options.length === 0) {
      p.log.error("This directory is empty.");
      return null;
    }

    const display = path.relative(root, current) || ".";
    const value = await p.autocomplete({
      message: `Select a file (in ${display}):`,
      options,
      maxItems: 15,
    });

    if (p.isCancel(value)) return null;
    if (typeof value !== "string" || value === "") return null;

    if (value === UP) {
      current = path.dirname(current);
      stack.pop();
      continue;
    }

    if (fs.statSync(value).isDirectory()) {
      stack.push(current);
      current = value;
      continue;
    }

    return path.relative(root, value);
  }
}
