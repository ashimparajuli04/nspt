import { homedir } from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

const GITHUB_API = "https://api.github.com";
const GITHUB_WEB = "https://github.com";
const CACHE_DIR = path.join(homedir(), ".config", "nspt");
const KEYS_CACHE_PATH = path.join(CACHE_DIR, "github_keys.json");

export class GithubRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubRateLimitError";
  }
}

export interface GithubKey {
  key: string;
  title: string;
}

interface KeysCache {
  username: string;
  keys: GithubKey[];
  fetchedAt: string;
}

function readCache(username: string): GithubKey[] | null {
  try {
    const raw = fs.readFileSync(KEYS_CACHE_PATH, "utf-8");
    const cache = JSON.parse(raw) as KeysCache;
    if (cache.username !== username) return null;
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    if (age > 3600_000) return null;
    return cache.keys;
  } catch {
    return null;
  }
}

function writeCache(username: string, keys: GithubKey[]): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    KEYS_CACHE_PATH,
    JSON.stringify(
      { username, keys, fetchedAt: new Date().toISOString() },
      null,
      2
    )
  );
}

const KEY_TYPE_RE = /^(ssh-|ecdsa-|sk-)/;

/**
 * Parse the plain-text body of `https://github.com/<username>.keys`.
 * Each line is an authorized_keys entry: `<type> <base64> [comment]`.
 * The comment is kept as the title, so the `key` string stays in the
 * API-compatible `<type> <base64>` format (no trailing comment).
 */
export function parseKeysBody(body: string): GithubKey[] {
  const keys: GithubKey[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const type = parts[0];
    const key = parts[1];
    if (parts.length < 2 || !type || !key || !KEY_TYPE_RE.test(type)) continue;
    keys.push({ key: `${type} ${key}`, title: parts.slice(2).join(" ") });
  }
  return keys;
}

export interface FetchUserKeysOptions {
  /** When false, always fetch from GitHub and ignore the local cache. */
  useCache?: boolean;
}

export async function fetchUserKeys(
  username: string,
  options: FetchUserKeysOptions = {}
): Promise<GithubKey[]> {
  if (options.useCache !== false) {
    const cached = readCache(username);
    if (cached) return cached;
  }

  try {
    const res = await fetch(
      `${GITHUB_WEB}/${encodeURIComponent(username)}.keys`,
      { headers: { "User-Agent": "nspt-cli" } }
    );
    if (!res.ok) return [];
    const keys = parseKeysBody(await res.text());
    writeCache(username, keys);
    return keys;
  } catch {
    return [];
  }
}

export async function fetchAuthenticatedUser(
  token?: string
): Promise<string | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "nspt-cli",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${GITHUB_API}/user`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { login: string };
    return data.login;
  } catch {
    return null;
  }
}
