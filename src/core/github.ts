import { homedir } from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

const GITHUB_API = "https://api.github.com";
const CACHE_DIR = path.join(homedir(), ".config", "nspt");
const KEYS_CACHE_PATH = path.join(CACHE_DIR, "github_keys.json");

export class GithubRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubRateLimitError";
  }
}

export interface GithubKey {
  id: number;
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

export interface FetchUserKeysOptions {
  /** When false, always fetch from GitHub and ignore the local cache. */
  useCache?: boolean;
}

export async function fetchUserKeys(
  username: string,
  token?: string,
  options: FetchUserKeysOptions = {}
): Promise<GithubKey[]> {
  if (options.useCache !== false) {
    const cached = readCache(username);
    if (cached) return cached;
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "nspt-cli",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(
      `${GITHUB_API}/users/${encodeURIComponent(username)}/keys?per_page=100`,
      { headers }
    );

    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        const body = await res.text().catch(() => "");
        if (/rate limit/i.test(body)) {
          throw new GithubRateLimitError(
            "GitHub API rate limit exceeded. Try again later, or pass a token for authenticated requests."
          );
        }
      }
      return [];
    }

    const data = (await res.json()) as Array<{
      id: number;
      key: string;
      title: string;
    }>;

    const keys: GithubKey[] = data.map((item) => ({
      id: item.id,
      key: item.key,
      title: item.title,
    }));

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
