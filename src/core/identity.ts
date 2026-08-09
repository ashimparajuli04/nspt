import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir, tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

// GitHub's official SSH host keys, verified against their published fingerprints:
//   RSA     SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s
//   ECDSA   SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM
//   ED25519 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
const GITHUB_HOST_KEYS = [
  "github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=",
  "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=",
  "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
].join("\n");

const IDENTITY_PATH = path.join(homedir(), ".config", "nspt", "identity.json");

interface Identity {
  githubUsername: string;
}

// --- detection strategies ---

function sshArgs(knownHostsFile: string): string[] {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${knownHostsFile}`,
    "-T", "git@github.com",
  ];
}

async function fromSshBanner(): Promise<string | null> {
  const knownHostsFile = path.join(tmpdir(), `nspt-github-known_hosts-${process.pid}`);
  fs.writeFileSync(knownHostsFile, GITHUB_HOST_KEYS);
  try {
    const { stderr } = await execFileAsync("ssh", sshArgs(knownHostsFile), { timeout: 10_000 });
    return parseBanner(stderr);
  } catch (err) {
    return parseBanner((err as { stderr?: string }).stderr ?? "");
  } finally {
    fs.rmSync(knownHostsFile, { force: true });
  }
}

function parseBanner(output: string): string | null {
  const match = output.match(/Hi (\S+)! You've successfully authenticated/);
  return match?.[1] ?? null;
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

// --- public entry points ---

export function getCachedUsername(): string | null {
  return readCachedIdentity()?.githubUsername ?? null;
}

export async function getVerifiedUsername(): Promise<string | null> {
  const detected = await fromSshBanner();
  if (detected) {
    saveIdentity(detected);
    return detected;
  }
  return null;
}