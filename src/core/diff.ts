import { diffLines } from "diff";
import { styleText } from "node:util";
import stringWidth from "fast-string-width";

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

/**
 * Styling functions for every piece of the rendered diff. Exposed so callers
 * can reuse the same visual style outside of `renderUnifiedDiff` (for example
 * the `=== <path> ===` file header printed between files) instead of
 * hardcoding colors in a single command.
 */
export interface DiffStyler {
  /** Full-line style for an added line, including the leading `+`. */
  added: (line: string) => string;
  /** Full-line style for a removed line, including the leading `-`. */
  removed: (line: string) => string;
  /** Style for an unchanged/context line (already prefixed with a space). */
  context: (line: string) => string;
  /** Style for a hunk header (`@@ ... @@`). */
  hunkHeader: (header: string) => string;
  /** Style for the `--- a/...` file header. */
  oldFileHeader: (header: string) => string;
  /** Style for the `+++ b/...` file header. */
  newFileHeader: (header: string) => string;
  /** Style for any other diff/file header (e.g. `=== <path> ===`). */
  fileHeader: (header: string) => string;
}

export interface RenderUnifiedDiffOptions {
  /** Enable ANSI colors. Defaults to `process.stdout.isTTY`. */
  color?: boolean;
  /**
   * Custom styler. Defaults to a GitHub-style terminal theme built on
   * `node:util`'s `styleText`.
   */
  styler?: DiffStyler;
}

const monoStyler: DiffStyler = {
  added: (line) => line,
  removed: (line) => line,
  context: (line) => line,
  hunkHeader: (header) => header,
  oldFileHeader: (header) => header,
  newFileHeader: (header) => header,
  fileHeader: (header) => header,
};

/**
 * GitHub-style colors for full-line backgrounds, as RGB triplets. Expressed
 * as truecolor because ANSI background codes (41/101/42/102) are remapped by
 * the terminal theme and often render as a muted "salmon" instead of red.
 */
const BG_ADDED = { r: 46, g: 160, b: 67 };
const BG_REMOVED = { r: 255, g: 71, b: 71 };

function rgbBackground(rgb: { r: number; g: number; b: number }): (text: string) => string {
  const open = `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m`;
  return (text) => `${open}${text}\x1b[49m`;
}

function supportsTrueColor(stream: { getColorDepth?: () => number } = process.stdout): boolean {
  if (typeof stream.getColorDepth === "function" && stream.getColorDepth() === 0x100_0000) {
    return true;
  }
  const colorTerm = process.env.COLORTERM;
  return colorTerm === "truecolor" || colorTerm === "24bit";
}

/**
 * Build a GitHub-style diff styler.
 *
 * Added lines get a green background and removed lines a red background
 * spanning the whole line, while hunk headers stay a subtle cyan. Uses the
 * terminal's default foreground so the output stays readable in both light
 * and dark themes. Backgrounds use 24-bit truecolor when the terminal
 * supports it (so red is actually red, whatever the theme), and fall back to
 * the ANSI bright variants otherwise.
 */
export function createDiffStyler(color?: boolean): DiffStyler {
  if ((color ?? process.stdout.isTTY === true) === false) return monoStyler;
  const added = supportsTrueColor() ? rgbBackground(BG_ADDED) : (line: string) => styleText("bgGreenBright", line);
  const removed = supportsTrueColor() ? rgbBackground(BG_REMOVED) : (line: string) => styleText("bgRedBright", line);
  return {
    added,
    removed,
    context: (line) => line,
    hunkHeader: (header) => styleText("cyan", header),
    oldFileHeader: (header) => styleText("red", header),
    newFileHeader: (header) => styleText("green", header),
    fileHeader: (header) => styleText("cyan", header),
  };
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

/**
 * Control characters whose terminal width is ambiguous (tabs expand
 * position-dependently, other control codes are rendered as nothing or
 * act as escapes). Lines containing them get a background color but are not
 * padded to the block width, so padding can never be computed from a wrong
 * width.
 */
const WIDTH_UNSAFE_RE = /[\t\r\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function padToWidth(line: string, width: number): string {
  const current = stringWidth(line);
  if (current >= width) return line;
  return line + " ".repeat(width - current);
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
  const styler = options.styler ?? createDiffStyler(color);
  const padBlock = options.styler !== undefined || color;

  let result = styler.oldFileHeader(`--- a/${fileA}`) + "\n";
  result += styler.newFileHeader(`+++ b/${fileB}`) + "\n";

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
    result += styler.hunkHeader(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`) + "\n";

    let blockWidth = 0;
    for (let j = hunk.start; j < hunk.end; j++) {
      const line = out[j]!;
      if (line.type === "add" || line.type === "del") {
        blockWidth = Math.max(blockWidth, stringWidth(line.text) + 1);
      }
    }

    for (let j = hunk.start; j < hunk.end; j++) {
      const line = out[j]!;
      const mark = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
      let content = mark + line.text;
      if (padBlock && line.type !== "context" && !WIDTH_UNSAFE_RE.test(content)) {
        content = padToWidth(content, blockWidth);
      }
      const text =
        line.type === "add"
          ? styler.added(content)
          : line.type === "del"
            ? styler.removed(content)
            : styler.context(content);
      result += text + "\n";
    }
  }

  return result;
}
