import * as p from "@clack/prompts";
import type {
  AutocompleteOptions,
  ConfirmOptions,
  MultiSelectOptions,
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

const ESCAPE_KEY = "escape";
const CTRL_C_KEY = "\x03";
const DEFAULT_BACK_KEY = "\x07"; // Ctrl+G

/**
 * Resolve the global "back" key. Defaults to Ctrl+G because terminals that
 * swallow Esc (Neovim's `:terminal`, for example) still forward it. Override
 * with `NSPT_BACK_KEY` using `ctrl+g` / `left` / `q` / a single character.
 */
function parseBackKey(spec: string): string | null {
  const s = spec.trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (low === "esc" || low === "escape") return ESCAPE_KEY;
  if (low.startsWith("ctrl+") || low.startsWith("c-")) {
    const rest = low.slice(low.startsWith("ctrl+") ? 5 : 2);
    if (rest === "space") return "\x00";
    if (rest === "[") return ESCAPE_KEY;
    if (rest.length === 1) {
      const code = rest.charCodeAt(0);
      if (code >= 97 && code <= 122) return String.fromCharCode(code - 96); // a..z -> 0x01..0x1a
    }
    return null;
  }
  if (["left", "right", "up", "down", "tab", "space"].includes(low)) return low;
  if (s.length === 1) return s;
  return null;
}

function describeBackKey(key: string): string {
  if (key === ESCAPE_KEY) return "Esc";
  if (key.length === 1) {
    const code = key.charCodeAt(0);
    if (code === 0) return "Ctrl+Space";
    if (code > 0 && code < 27) return `Ctrl+${String.fromCharCode(code + 64)}`;
    return key === " " ? "Space" : key.toUpperCase();
  }
  const named: Record<string, string> = {
    left: "←",
    right: "→",
    up: "↑",
    down: "↓",
    tab: "Tab",
    space: "Space",
  };
  return named[key] ?? key;
}

const GLOBAL_BACK_KEY =
  (process.env["NSPT_BACK_KEY"] && parseBackKey(process.env["NSPT_BACK_KEY"])) ||
  DEFAULT_BACK_KEY;

// Clack resolves a cancel by matching the pressed key's name/sequence against
// `settings.aliases`, so registering the global key here makes it work in every
// prompt without touching the prompts themselves.
settings.aliases.set(GLOBAL_BACK_KEY, "cancel");

SELECT_INSTRUCTIONS.splice(
  0,
  SELECT_INSTRUCTIONS.length,
  `${styleText("dim", "↑/↓")} navigate`,
  `${styleText("dim", "Enter:")} select`,
  `${styleText("dim", `${describeBackKey(GLOBAL_BACK_KEY)}:`)} back`
);

/**
 * When true, confirmation prompts are auto-accepted. Enabled by the global
 * `--yes` flag so destructive-ish commands can run non-interactively.
 */
let assumeYes = false;

export function setAssumeYes(value: boolean): void {
  assumeYes = value;
}

export function isAssumeYes(): boolean {
  return assumeYes;
}

type CancelSource = "escape" | "ctrl-c" | "back";
let lastCancelKey: CancelSource | null = null;

interface KeyInfo {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

function matchesGlobalBack(key: KeyInfo): boolean {
  if (GLOBAL_BACK_KEY === ESCAPE_KEY) return key.name === ESCAPE_KEY;
  if (GLOBAL_BACK_KEY.length === 1) {
    const code = GLOBAL_BACK_KEY.charCodeAt(0);
    if (code === 0) return key.ctrl === true && key.name === "space";
    if (code > 0 && code < 27) {
      return key.ctrl === true && key.name === String.fromCharCode(code + 96);
    }
    return key.name === GLOBAL_BACK_KEY;
  }
  return key.name === GLOBAL_BACK_KEY;
}

/** Extra keys enabled only for list-style prompts (where they aren't typing). */
interface BackKeys {
  /** Left arrow acts as "back". */
  leftBack?: boolean;
  /** Right arrow acts as "select/enter" (like pressing Enter). */
  rightEnter?: boolean;
}

async function withBackKeys<T>(
  keys: BackKeys,
  run: () => Promise<T | symbol | undefined>
): Promise<PromptResult<T>> {
  lastCancelKey = null;

  const addedAliases: string[] = [];
  if (keys.leftBack && !settings.aliases.has("left")) {
    settings.aliases.set("left", "cancel");
    addedAliases.push("left");
  }

  const handler = (_chunk: unknown, key?: KeyInfo): void => {
    if (!key) return;
    if (key.name === ESCAPE_KEY || matchesGlobalBack(key)) {
      lastCancelKey = "back";
      return;
    }
    if (key.ctrl && key.name === "c") {
      lastCancelKey = "ctrl-c";
      return;
    }
    if (keys.leftBack && key.name === "left") {
      lastCancelKey = "back";
      return;
    }
    if (keys.rightEnter && key.name === "right") {
      // Right = "go in": replay Enter so the prompt submits the focused value.
      process.stdin.emit("keypress", "\r", { name: "return", sequence: "\r" });
    }
  };

  process.stdin.on("keypress", handler);
  try {
    const value = await run();
    if (p.isCancel(value)) {
      // Ctrl+C quits nspt; every other cancel (Esc, Ctrl+G, Left) means "back".
      if (lastCancelKey === "ctrl-c") process.exit(0);
      return BACK;
    }
    return value as T;
  } finally {
    process.stdin.off("keypress", handler);
    for (const alias of addedAliases) settings.aliases.delete(alias);
  }
}

/**
 * Back handling for a custom list prompt (used by `menuSelect`), with Left as
 * back and Right as enter.
 */
export function withBack<T>(run: () => Promise<T | symbol | undefined>): Promise<PromptResult<T>> {
  return withBackKeys<T>({ leftBack: true, rightEnter: true }, run);
}

export function select<Value>(options: SelectOptions<Value>): Promise<PromptResult<Value>> {
  return withBackKeys<Value>({ leftBack: true, rightEnter: true }, () => p.select(options));
}

export function autocomplete<Value>(
  options: AutocompleteOptions<Value>
): Promise<PromptResult<Value>> {
  return withBackKeys<Value>({ leftBack: true, rightEnter: true }, () => p.autocomplete(options));
}

export function confirm(options: ConfirmOptions): Promise<PromptResult<boolean>> {
  if (assumeYes) return Promise.resolve(true);
  return withBackKeys<boolean>({ leftBack: true }, () => p.confirm(options));
}

export function multiselect<Value>(
  options: MultiSelectOptions<Value>
): Promise<PromptResult<Value[]>> {
  return withBackKeys<Value[]>({ leftBack: true, rightEnter: true }, () => p.multiselect(options));
}

export function text(options: TextOptions): Promise<PromptResult<string>> {
  return withBackKeys<string>({}, () => p.text(options));
}

export function password(options: PasswordOptions): Promise<PromptResult<string>> {
  return withBackKeys<string>({}, () => p.password(options));
}

/**
 * Disables the cancel keys (Esc, Ctrl+C, and the global back key) for the
 * duration of `run`. Used around critical, non-reversible phases (e.g. key
 * rotation) so a stray keypress can't interrupt a partially-applied operation.
 */
export async function withEscInert<T>(run: () => Promise<T>): Promise<T> {
  const disabled = [...new Set([ESCAPE_KEY, CTRL_C_KEY, GLOBAL_BACK_KEY])];
  type Action = Parameters<typeof settings.aliases.set>[1];
  const restore: [string, Action][] = [];
  for (const key of disabled) {
    const previous = settings.aliases.get(key);
    if (previous !== undefined) {
      restore.push([key, previous]);
      settings.aliases.delete(key);
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, action] of restore) settings.aliases.set(key, action);
  }
}
