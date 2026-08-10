import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { fetchUserKeys } from "./github.js";

const execFileAsync = promisify(execFile);

export interface SshPublicKey {
  type: string;
  key: string;
  comment?: string | undefined;
  fingerprint?: string | undefined;
  source: "local" | string;
}

const SSH_DIR = path.join(homedir(), ".ssh");
const KEY_NAMES = ["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"];

async function sshKeygenFingerprint(pubKeyPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("ssh-keygen", ["-lf", pubKeyPath], { timeout: 5000 });
    const match = stdout.trim().match(/^(\S+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function parsePubKey(content: string, source: string): SshPublicKey | null {
  const parts = content.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return {
    type: parts[0]!,
    key: parts[1]!,
    comment: parts[2],
    source,
  };
}

async function readPubFile(filePath: string): Promise<SshPublicKey | null> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parsePubKey(content, filePath);
    if (parsed) {
      parsed.fingerprint = await sshKeygenFingerprint(filePath);
    }
    return parsed;
  } catch {
    return null;
  }
}

async function generatePubFromPrivate(privateKeyPath: string): Promise<SshPublicKey | null> {
  const pubPath = `${privateKeyPath}.pub`;

  if (fs.existsSync(pubPath)) {
    return readPubFile(pubPath);
  }

  try {
    const { stdout } = await execFileAsync("ssh-keygen", ["-y", "-f", privateKeyPath], { timeout: 5000 });
    const parsed = parsePubKey(stdout, pubPath);
    if (parsed) {
      parsed.fingerprint = await sshKeygenFingerprint(pubPath);
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function discoverLocalKeys(): Promise<SshPublicKey[]> {
  const keys: SshPublicKey[] = [];

  if (!fs.existsSync(SSH_DIR)) {
    return keys;
  }

  for (const name of KEY_NAMES) {
    const pubPath = path.join(SSH_DIR, `${name}.pub`);
    const privPath = path.join(SSH_DIR, name);

    if (fs.existsSync(pubPath)) {
      const key = await readPubFile(pubPath);
      if (key) keys.push(key);
    } else if (fs.existsSync(privPath)) {
      const key = await generatePubFromPrivate(privPath);
      if (key) keys.push(key);
    }
  }

  const entries = fs.readdirSync(SSH_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.isFile() &&
      entry.name.endsWith(".pub") &&
      !KEY_NAMES.some((n) => entry.name === `${n}.pub`)
    ) {
      const pubPath = path.join(SSH_DIR, entry.name);
      const key = await readPubFile(pubPath);
      if (key && !keys.some((k) => k.key === key.key)) {
        keys.push(key);
      }
    }
  }

  return keys;
}

export function keyMatches(local: SshPublicKey, remote: SshPublicKey): boolean {
  if (local.type !== remote.type) return false;
  if (local.key === remote.key) return true;
  if (local.fingerprint && remote.fingerprint) {
    return local.fingerprint === remote.fingerprint;
  }
  return false;
}

export async function tallyKeys(
  username: string
): Promise<{ local: SshPublicKey[]; github: SshPublicKey[]; matched: SshPublicKey[] }> {
  const [localKeys, githubKeysRaw] = await Promise.all([
    discoverLocalKeys(),
    fetchUserKeys(username),
  ]);

  const github: SshPublicKey[] = githubKeysRaw.map((k) => ({
    type: k.key.split(/\s+/)[0]!,
    key: k.key.split(/\s+/)[1]!,
    comment: k.title,
    source: `github:${username}`,
  }));

  const matched: SshPublicKey[] = [];
  for (const local of localKeys) {
    if (github.some((remote) => keyMatches(local, remote))) {
      matched.push(local);
    }
  }

  return { local: localKeys, github, matched };
}
