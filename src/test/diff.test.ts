import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  diffSummary,
  renderUnifiedDiff,
  createDiffStyler,
} from "../core/diff.js";

let prevColorTerm: string | undefined;
before(() => {
  process.env.FORCE_COLOR = "1";
  prevColorTerm = process.env.COLORTERM;
  delete process.env.COLORTERM;
});
after(() => {
  delete process.env.FORCE_COLOR;
  if (prevColorTerm === undefined) delete process.env.COLORTERM;
  else process.env.COLORTERM = prevColorTerm;
});

const A = "huhuhahaah\nasdasdasd\ndasdasdasdnp\nsada\n";
const B = "huhuhahaah\nasdasdasd\ndasdasdasdnp\n";

test("diffSummary counts added and removed lines", () => {
  assert.deepEqual(diffSummary(A, B), { additions: 0, deletions: 1 });
  assert.deepEqual(diffSummary("", B), { additions: 3, deletions: 0 });
  assert.deepEqual(diffSummary(B, ""), { additions: 0, deletions: 3 });
});

test("renderUnifiedDiff returns null when there are no changes", () => {
  assert.equal(renderUnifiedDiff("f", "f", B, B), null);
});

test("renderUnifiedDiff without color is a plain unified diff without padding", () => {
  const out = renderUnifiedDiff("f", "f", A, B, { color: false });
  assert.match(out!, /^--- a\/f\n\+\+\+ b\/f\n/);
  assert.match(out!, /@@ -1,4 \+1,3 @@/);
  assert.ok(out!.includes("-sada\n"));
  assert.ok(!out!.includes("\u001b["));
  assert.ok(!out!.includes("  \n"), "should not pad lines in mono mode");
});

test("renderUnifiedDiff paints full-line backgrounds and keeps marks visible", () => {
  const out = renderUnifiedDiff("f", "f", A, B, { color: true })!;
  assert.ok(out.includes("\u001b[101m-sada\u001b[49m"), "removed line gets a red background");
  for (const line of out.split("\n")) {
    if (line.includes("\u001b[101m")) {
      assert.ok(line.startsWith("\u001b[101m-"), "red background line starts with the mark");
    }
    if (line.includes("\u001b[102m")) {
      assert.ok(line.startsWith("\u001b[102m+"), "green background line starts with the mark");
    }
  }
  assert.ok(out.includes("\u001b[36m@@ "), "hunk header is cyan");
  assert.ok(out.includes("\u001b[31m--- a/f"), "old file header is red");
  assert.ok(out.includes("\u001b[32m+++ b/f"), "new file header is green");
});

test("renderUnifiedDiff gives added lines a green background", () => {
  const out = renderUnifiedDiff("f", "f", "old\n", "new\n", { color: true })!;
  assert.ok(out.includes("\u001b[101m-old\u001b[49m"));
  assert.ok(out.includes("\u001b[102m+new\u001b[49m"));
});

test("renderUnifiedDiff pads short changed lines to the hunk block width", () => {
  const out = renderUnifiedDiff("f", "f", "aaaa\nbb\n", "cc\n", { color: true })!;
  const red = out.split("\n").filter((l) => l.startsWith("\u001b[101m"));
  assert.deepEqual(red, ["\u001b[101m-aaaa\u001b[49m", "\u001b[101m-bb  \u001b[49m"]);
  assert.ok(out.includes("\u001b[102m+cc  \u001b[49m"));
});

test("renderUnifiedDiff pads by visible width, not raw string length", () => {
  const out = renderUnifiedDiff("f", "f", "汉aa\nbb\n", "x\n", { color: true })!;
  const red = out.split("\n").filter((l) => l.startsWith("\u001b[101m"));
  assert.deepEqual(red, ["\u001b[101m-汉aa\u001b[49m", "\u001b[101m-bb  \u001b[49m"]);
  assert.ok(out.includes("\u001b[102m+x   \u001b[49m"));
});

test("renderUnifiedDiff skips padding for lines with ambiguous-width control characters", () => {
  const out = renderUnifiedDiff("f", "f", "tab\there\nverylonglinehere\n", "x\n", { color: true })!;
  assert.ok(out.includes("\u001b[101m-tab\there\u001b[49m\n"), "tab line is not padded");
  assert.ok(out.includes("\u001b[101m-verylonglinehere\u001b[49m\n"), "long line is not padded");
});

test("createDiffStyler is reusable for standalone file headers", () => {
  const styler = createDiffStyler(true);
  assert.equal(styler.fileHeader("=== .env ==="), "\u001b[36m=== .env ===\u001b[39m");
  assert.equal(createDiffStyler(false).fileHeader("=== .env ==="), "=== .env ===");
  assert.equal(styler.context(" plain"), " plain");
});

test("createDiffStyler uses truecolor backgrounds when the terminal supports it", () => {
  const prev = process.env.COLORTERM;
  process.env.COLORTERM = "truecolor";
  try {
    const styler = createDiffStyler(true);
    assert.equal(styler.removed("-x"), "\u001b[48;2;255;71;71m-x\u001b[49m");
    assert.equal(styler.added("+x"), "\u001b[48;2;46;160;67m+x\u001b[49m");
  } finally {
    if (prev === undefined) delete process.env.COLORTERM;
    else process.env.COLORTERM = prev;
  }
});
