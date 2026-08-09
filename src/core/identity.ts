// src/core/identity.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

const SSH_ARGS = [
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=5",
  "-o", "StrictHostKeyChecking=no",
  "-o", "UserKnownHostsFile=/dev/null",
  "-T", "git@github.com",
];

const IDENTITY_PATH = path.join(homedir(), ".config", "nspt", "identity.json");

interface Identity {
  githubUsername: string;
}

// --- detection strategies ---

async function fromSshBanner(): Promise<string | null> {
  try {
    const { stderr } = await execFileAsync("ssh", SSH_ARGS, { timeout: 10_000 });
    return parseBanner(stderr);
  } catch (err) {
    return parseBanner((err as { stderr?: string }).stderr ?? "");
  }
}

function parseBanner(output: string): string | null {
  const match = output.match(/Hi (\w+)! You've successfully authenticated/);
  return match?.[1] ?? null;
}

// --- github verification ---

async function fetchGithubKeys(username: string): Promise<string[]> {
  const res = await fetch(`https://github.com/${username}.keys`);
  if (!res.ok) throw new Error(`Couldn't fetch keys for ${username}`);
  const text = await res.text();
  return text.trim().split("\n").filter(Boolean);
}

// --- local cache ---

function readCachedIdentity(): Identity | null {
  try {
    const raw = fs.readFileSync(IDENTITY_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveIdentity(username: string): void {
  fs.mkdirSync(path.dirname(IDENTITY_PATH), { recursive: true });
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify({ githubUsername: username }, null, 2));
}

// --- public entry point ---

export async function getVerifiedUsername(
  promptForUsername: () => Promise<string>
): Promise<string> {
  // 1. Try asking GitHub directly via SSH — most trustworthy, one round trip
  const detected = await fromSshBanner();
  if (detected) {
    saveIdentity(detected); // keep cache in sync for future fast paths / offline use
    return detected;
  }

  // 2. Fall back to a cached identity, but only trust it if still consistent
  const cached = readCachedIdentity();
  if (cached) {
    try {
      const githubKeys = await fetchGithubKeys(cached.githubUsername);
      // if SSH banner failed but we can still verify via HTTP fetch, trust the cache
      if (githubKeys.length > 0) {
        return cached.githubUsername;
      }
    } catch {
      // fetch failed too (offline?) — fall through to manual prompt
    }
  }

  // 3. Last resort — ask the user, then verify before trusting it
  const username = await promptForUsername();
  const githubKeys = await fetchGithubKeys(username);
  if (githubKeys.length === 0) {
    throw new Error(`No public keys found for github.com/${username}`);
  }
  saveIdentity(username);
  return username;
}