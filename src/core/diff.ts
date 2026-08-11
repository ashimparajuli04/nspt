import { diffLines } from "diff";
import { styleText } from "node:util";

const CONTEXT_LINES = 3;

type LineType = "context" | "add" | "del";

interface DiffLine {
  type: LineType;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffSummary {
  additions: number;
  deletions: number;
}

export interface RenderUnifiedDiffOptions {
  color?: boolean;
}

function linesOf(value: string): string[] {
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function diffSummary(a: string, b: string): DiffSummary {
  const changes = diffLines(a, b);
  let additions = 0;
  let deletions = 0;
  for (const change of changes) {
    const n = linesOf(change.value).length;
    if (change.added) additions += n;
    else if (change.removed) deletions += n;
  }
  return { additions, deletions };
}

export function renderUnifiedDiff(
  fileA: string,
  fileB: string,
  a: string,
  b: string,
  options: RenderUnifiedDiffOptions = {}
): string | null {
  const changes = diffLines(a, b);

  const out: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let hasChanges = false;
  for (const change of changes) {
    const text = linesOf(change.value);
    if (change.removed) {
      hasChanges = true;
      for (const line of text) {
        out.push({ type: "del", text: line, oldLine: oldLine++, newLine: null });
      }
    } else if (change.added) {
      hasChanges = true;
      for (const line of text) {
        out.push({ type: "add", text: line, oldLine: null, newLine: newLine++ });
      }
    } else {
      for (const line of text) {
        out.push({ type: "context", text: line, oldLine: oldLine++, newLine: newLine++ });
      }
    }
  }
  if (!hasChanges) return null;

  const changeIdx: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i]!.type !== "context") changeIdx.push(i);
  }

  interface Hunk {
    start: number;
    end: number;
  }
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < changeIdx.length) {
    let last = i;
    while (last + 1 < changeIdx.length) {
      const next = changeIdx[last + 1]!;
      const cur = changeIdx[last]!;
      if (next - cur - 1 > CONTEXT_LINES * 2) break;
      last++;
    }
    hunks.push({
      start: Math.max(0, changeIdx[i]! - CONTEXT_LINES),
      end: Math.min(out.length, changeIdx[last]! + CONTEXT_LINES + 1),
    });
    i = last + 1;
  }

  const color = options.color ?? process.stdout.isTTY === true;

  let result = `--- a/${fileA}\n`;
  result += `+++ b/${fileB}\n`;

  for (const hunk of hunks) {
    let oldStart = 0;
    let newStart = 0;
    let oldCount = 0;
    let newCount = 0;
    for (let j = hunk.start; j < hunk.end; j++) {
      const line = out[j]!;
      if (line.oldLine !== null) {
        if (oldCount === 0) oldStart = line.oldLine;
        oldCount++;
      }
      if (line.newLine !== null) {
        if (newCount === 0) newStart = line.newLine;
        newCount++;
      }
    }
    result += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`;

    for (let j = hunk.start; j < hunk.end; j++) {
      const line = out[j]!;
      const mark = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
      let text: string;
      if (color) {
        if (line.type === "add") text = styleText("green", mark + line.text);
        else if (line.type === "del") text = styleText("red", mark + line.text);
        else text = mark + line.text;
      } else {
        text = mark + line.text;
      }
      result += text + "\n";
    }
  }

  return result;
}
