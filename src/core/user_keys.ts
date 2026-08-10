import * as fs from "node:fs";
import * as path from "node:path";
import * as toml from "smol-toml";
import type { UserKeysFile, UserEntry, UserKeyEntry } from "../types.js";

const HEADER = `# nspt user keys — do not edit manually
# Each entry maps a user's age public key to an age-wrapped group file key.
`;

export function userKeysPath(groupDir: string): string {
  return path.join(groupDir, "user_keys.toml");
}

export function readUserKeys(groupDir: string): UserKeysFile | null {
  const p = userKeysPath(groupDir);
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = toml.parse(raw) as Record<string, unknown>;
    return normalizeUserKeys(parsed);
  } catch {
    return null;
  }
}

export function writeUserKeys(groupDir: string, data: UserKeysFile): void {
  const p = userKeysPath(groupDir);
  const out: Record<string, unknown> = { key_version: data.key_version };
  for (const user of data.users) {
    if (!Array.isArray(out["users"])) out["users"] = [];
    (out["users"] as unknown[]).push({
      username: user.username,
      keys: user.keys.map((k) => ({
        age: k.age,
        ssh: k.ssh,
        wrapped: k.wrapped,
      })),
    });
  }
  fs.writeFileSync(p, HEADER + toml.stringify(out));
}

export function addUserKey(
  data: UserKeysFile,
  username: string,
  entry: UserKeyEntry
): boolean {
  const user = data.users.find((u) => u.username === username);
  if (user) {
    const dup = user.keys.some(
      (k) => k.age === entry.age || k.ssh === entry.ssh
    );
    if (dup) return false;
    user.keys.push(entry);
    return true;
  }
  data.users.push({ username, keys: [entry] });
  return true;
}

export function listUsers(data: UserKeysFile): string[] {
  return data.users.map((u) => u.username);
}

export function getUserKeys(
  data: UserKeysFile,
  username: string
): UserEntry | undefined {
  return data.users.find((u) => u.username === username);
}

function normalizeUserKeys(raw: Record<string, unknown>): UserKeysFile {
  const key_version =
    typeof raw["key_version"] === "number" ? raw["key_version"] : 1;
  const rawUsers = Array.isArray(raw["users"]) ? raw["users"] : [];
  const users: UserEntry[] = [];
  for (const ru of rawUsers) {
    const r = ru as Record<string, unknown>;
    const username = typeof r["username"] === "string" ? r["username"] : "";
    const rawKeys = Array.isArray(r["keys"]) ? r["keys"] : [];
    const keys: UserKeyEntry[] = [];
    for (const rk of rawKeys) {
      const k = rk as Record<string, unknown>;
      keys.push({
        age: typeof k["age"] === "string" ? k["age"] : "",
        ssh: typeof k["ssh"] === "string" ? k["ssh"] : "",
        wrapped: typeof k["wrapped"] === "string" ? k["wrapped"] : "",
      });
    }
    users.push({ username, keys });
  }
  return { key_version, users };
}
