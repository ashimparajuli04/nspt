import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

const AGE_BASE = path.join(homedir(), ".config", "nspt", "age");

export function ageIdentityDir(groupName: string): string {
  return path.join(AGE_BASE, groupName);
}

export function ageIdentityPath(groupName: string): string {
  return path.join(ageIdentityDir(groupName), "identity");
}

export function storeIdentity(groupName: string, identity: string): void {
  const dir = ageIdentityDir(groupName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ageIdentityPath(groupName), identity + "\n", {
    mode: 0o600,
  });
}

export function loadIdentity(groupName: string): string | null {
  try {
    const raw = fs.readFileSync(ageIdentityPath(groupName), "utf-8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function hasIdentity(groupName: string): boolean {
  return fs.existsSync(ageIdentityPath(groupName));
}
