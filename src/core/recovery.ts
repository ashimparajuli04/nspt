import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import * as toml from "smol-toml";
import type { RecoveryEntry, RecoveryFile } from "../types.js";

// ---------------------------------------------------------------------------
// Machine-local password store
//
// nspt installs globally, so the recovery password is one per machine/person
// rather than one per group. It lives outside the repo, next to the age
// identities nspt already keeps there, and enables silent auto-wrapping.
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(homedir(), ".config", "nspt");
const CONFIG_PATH = path.join(CONFIG_DIR, "recovery.json");

/** Allow tests (and unusual setups) to relocate the machine-local store. */
function configPath(): string {
  return process.env["NSPT_RECOVERY_CONFIG"] ?? CONFIG_PATH;
}

export interface RepoRecord {
  /** Absolute path of a repo root that holds at least one recovery entry. */
  root: string;
  groups: string[];
}

export interface RecoveryConfig {
  version: number;
  password: string;
  /** The member this machine belongs to, once known — lets us skip other members' wraps. */
  username?: string;
  repos: RepoRecord[];
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 30;

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

export function validateRecoveryPassword(password: string): PasswordCheck {
  if (password.length < PASSWORD_MIN) {
    return { ok: false, message: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, message: `Password must be at most ${PASSWORD_MAX} characters.` };
  }
  if (/\s/.test(password)) {
    return { ok: false, message: "Password must not contain spaces or line breaks." };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: "Password must contain at least one uppercase letter." };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: "Password must contain at least one lowercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "Password must contain at least one number." };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: "Password must contain at least one special character." };
  }
  return { ok: true };
}

export function readRecoveryConfig(): RecoveryConfig | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as Record<string, unknown>;
    const password = typeof parsed["password"] === "string" ? parsed["password"] : "";
    const rawRepos = Array.isArray(parsed["repos"]) ? parsed["repos"] : [];
    const repos: RepoRecord[] = [];
    for (const r of rawRepos) {
      const rec = r as Record<string, unknown>;
      const root = typeof rec["root"] === "string" ? rec["root"] : "";
      if (!root) continue;
      const groups = Array.isArray(rec["groups"])
        ? rec["groups"].filter((g): g is string => typeof g === "string")
        : [];
      repos.push({ root, groups });
    }
    if (!password) return null;
    const username = typeof parsed["username"] === "string" ? parsed["username"] : undefined;
    const config: RecoveryConfig = { version: 1, password, repos };
    if (username) config.username = username;
    return config;
  } catch {
    return null;
  }
}

function writeRecoveryConfig(config: RecoveryConfig): void {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  // `mode` is a no-op on Windows; re-assert it where the platform honours it.
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Ignore: Windows and some filesystems don't support POSIX modes.
  }
}

export function getStoredPassword(): string | null {
  return readRecoveryConfig()?.password ?? null;
}

export function getStoredUsername(): string | null {
  return readRecoveryConfig()?.username ?? null;
}

export function hasStoredPassword(): boolean {
  return getStoredPassword() !== null;
}

export function setStoredPassword(password: string): void {
  const config = readRecoveryConfig() ?? { version: 1, password, repos: [] };
  config.password = password;
  writeRecoveryConfig(config);
}

export function clearStoredPassword(): void {
  try {
    fs.rmSync(configPath(), { force: true });
  } catch {
    // Nothing to clear.
  }
}

/** Remember that this repo holds recovery entries, so password changes can warn. */
export function recordRepoUsage(root: string, groupName: string, username?: string): void {
  const config = readRecoveryConfig();
  if (!config) return;
  if (username) config.username = username;
  const normalized = path.resolve(root);
  const repo = config.repos.find((r) => r.root === normalized);
  if (repo) {
    if (!repo.groups.includes(groupName)) repo.groups.push(groupName);
  } else {
    config.repos.push({ root: normalized, groups: [groupName] });
  }
  writeRecoveryConfig(config);
}

export function knownRecoveryRepos(): RepoRecord[] {
  return readRecoveryConfig()?.repos ?? [];
}

// ---------------------------------------------------------------------------
// Per-group recovery.toml
// ---------------------------------------------------------------------------

const HEADER = `# nspt recovery wraps — do not edit manually
# Each entry holds the group file key sealed under a member's recovery password.
# Rotation makes these stale until the member's next key-based unlock.
`;

export function recoveryTomlPath(groupDir: string): string {
  return path.join(groupDir, "recovery.toml");
}

export function readRecoveryFile(groupDir: string): RecoveryFile {
  try {
    const raw = fs.readFileSync(recoveryTomlPath(groupDir), "utf-8");
    const parsed = toml.parse(raw) as Record<string, unknown>;
    return normalizeRecoveryFile(parsed);
  } catch {
    return { version: 1, entries: [] };
  }
}

export function writeRecoveryFile(groupDir: string, data: RecoveryFile): void {
  const out: Record<string, unknown> = { version: data.version };
  if (data.entries.length > 0) {
    out["recovery"] = data.entries.map((e) => ({
      username: e.username,
      fingerprint: e.fingerprint,
      wrapped: e.wrapped,
    }));
  }
  fs.writeFileSync(recoveryTomlPath(groupDir), HEADER + toml.stringify(out));
}

export function fingerprintFileKey(fileKeyHex: string): string {
  return createHash("sha256").update(fileKeyHex).digest("hex");
}

export function findRecoveryEntry(
  data: RecoveryFile,
  username: string
): RecoveryEntry | undefined {
  return data.entries.find((e) => e.username === username);
}

export function upsertRecoveryEntry(data: RecoveryFile, entry: RecoveryEntry): void {
  const existing = findRecoveryEntry(data, entry.username);
  if (existing) {
    existing.fingerprint = entry.fingerprint;
    existing.wrapped = entry.wrapped;
    return;
  }
  data.entries.push(entry);
}

export function removeRecoveryEntry(data: RecoveryFile, username: string): boolean {
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.username !== username);
  return data.entries.length < before;
}

function normalizeRecoveryFile(raw: Record<string, unknown>): RecoveryFile {
  const version = typeof raw["version"] === "number" ? raw["version"] : 1;
  const rawEntries = Array.isArray(raw["recovery"]) ? raw["recovery"] : [];
  const entries: RecoveryEntry[] = [];
  for (const re of rawEntries) {
    const r = re as Record<string, unknown>;
    entries.push({
      username: typeof r["username"] === "string" ? r["username"] : "",
      fingerprint: typeof r["fingerprint"] === "string" ? r["fingerprint"] : "",
      wrapped: typeof r["wrapped"] === "string" ? r["wrapped"] : "",
    });
  }
  return { version, entries };
}
