import * as p from "@clack/prompts";
import type {
  AutocompleteOptions,
  ConfirmOptions,
  PasswordOptions,
  SelectOptions,
  TextOptions,
} from "@clack/prompts";
import { SELECT_INSTRUCTIONS } from "@clack/prompts";
import { settings } from "@clack/core";
import { styleText } from "node:util";

export const BACK = Symbol("nspt:back");
export type PromptResult<T> = T | typeof BACK;

export function isBack(value: unknown): value is typeof BACK {
  return value === BACK;
}

SELECT_INSTRUCTIONS.splice(
  0,
  SELECT_INSTRUCTIONS.length,
  `${styleText("dim", "↑/↓")} navigate`,
  `${styleText("dim", "Enter:")} select`,
  `${styleText("dim", "Esc:")} back`
);

const ESCAPE_KEY = "escape";
const CTRL_C_KEY = "\x03";

let lastCancelKey: "escape" | "ctrl-c" | null = null;

function onKeypress(_chunk: unknown, key?: { name?: string; ctrl?: boolean }): void {
  if (!key) return;
  if (key.name === "escape") lastCancelKey = "escape";
  else if (key.ctrl && key.name === "c") lastCancelKey = "ctrl-c";
}

export async function withBack<T>(run: () => Promise<T | symbol | undefined>): Promise<PromptResult<T>> {
  lastCancelKey = null;
  process.stdin.on("keypress", onKeypress);
  try {
    const value = await run();
    if (p.isCancel(value)) {
      if (lastCancelKey === "escape") return BACK;
      process.exit(0);
    }
    return value as T;
  } finally {
    process.stdin.off("keypress", onKeypress);
  }
}

export function select<Value>(options: SelectOptions<Value>): Promise<PromptResult<Value>> {
  return withBack<Value>(() => p.select(options));
}

export function autocomplete<Value>(
  options: AutocompleteOptions<Value>
): Promise<PromptResult<Value>> {
  return withBack<Value>(() => p.autocomplete(options));
}

export function confirm(options: ConfirmOptions): Promise<PromptResult<boolean>> {
  return withBack<boolean>(() => p.confirm(options));
}

export function text(options: TextOptions): Promise<PromptResult<string>> {
  return withBack<string>(() => p.text(options));
}

export function password(options: PasswordOptions): Promise<PromptResult<string>> {
  return withBack<string>(() => p.password(options));
}

/**
 * Disables both Esc and Ctrl+C (clack aliases both to the "cancel" action) for
 * the duration of `run`. Used around critical, non-reversible phases (e.g. key
 * rotation) so a stray keypress can't interrupt a partially-applied operation.
 */
export async function withEscInert<T>(run: () => Promise<T>): Promise<T> {
  const hadEscape = settings.aliases.delete(ESCAPE_KEY);
  const hadCtrlC = settings.aliases.delete(CTRL_C_KEY);
  try {
    return await run();
  } finally {
    if (hadEscape) settings.aliases.set(ESCAPE_KEY, "cancel");
    if (hadCtrlC) settings.aliases.set(CTRL_C_KEY, "cancel");
  }
}
