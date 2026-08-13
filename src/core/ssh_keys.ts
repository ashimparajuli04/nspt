import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { createDecipheriv } from "node:crypto";
import * as bcryptPbkdf from "bcrypt-pbkdf";
import { fetchUserKeys } from "./github.js";
import { generateHelp } from "./platform.js";

const execFileAsync = promisify(execFile);

export const ED25519_KEY_TYPE = "ssh-ed25519";

const SSH_DIR = path.join(homedir(), ".ssh");
const MAX_KEY_FILE_SIZE = 64 * 1024;
const NON_KEY_FILES = new Set([
  "config",
  "known_hosts",
  "known_hosts2",
  "authorized_keys",
  "authorized_keys2",
  "identity",
]);

const OPENSSH_BEGIN = "-----BEGIN OPENSSH PRIVATE KEY-----";
const OPENSSH_END = "-----END OPENSSH PRIVATE KEY-----";
const OPENSSH_MAGIC = "openssh-key-v1\0";

export interface SshPublicKey {
  type: string;
  key: string;
  comment?: string | undefined;
  fingerprint?: string | undefined;
  /** "agent" or the path to the local private key the entry was derived from. */
  source: string;
  /** Decoded public-key bytes (for ed25519 this is the 32-byte point). */
  pubBytes?: Uint8Array | undefined;
  /** Whether a local private key is actually present (or the agent holds it). */
  hasPrivate?: boolean | undefined;
  /** True when the private key is passphrase-protected (public half is still readable). */
  encrypted?: boolean | undefined;
}

export interface OpenSshPrivateKey {
  /** The 32-byte ed25519 seed; null when the key is encrypted. */
  seed: Uint8Array | null;
  /** The public key as stored in the openssh-key-v1 blob (unencrypted even for passphrase keys). */
  pubWire: Uint8Array;
  /** Decoded 32-byte ed25519 public point. */
  pubBytes: Uint8Array;
  comment: string;
  encrypted: boolean;
  cipher: string;
  kdf: string;
}

// --- wire format helpers ---

export function sshWireString(type: string, payload: Uint8Array): Buffer {
  const typeBuf = Buffer.from(type);
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(typeBuf.length, 0);
  const payloadLen = Buffer.alloc(4);
  payloadLen.writeUInt32BE(payload.length, 0);
  return Buffer.concat([typeLen, typeBuf, payloadLen, Buffer.from(payload)]);
}

interface Cursor {
  off: number;
}

function readSshString(buf: Buffer, c: Cursor): Buffer | null {
  if (c.off + 4 > buf.length) return null;
  const len = buf.readUInt32BE(c.off);
  c.off += 4;
  if (c.off + len > buf.length) return null;
  const s = buf.subarray(c.off, c.off + len);
  c.off += len;
  return s;
}

/** Parse a wire-format public key blob ("ssh-ed25519" || 32-byte point). */
export function decodeEd25519Pub(wire: Uint8Array): Uint8Array | null {
  const buf = Buffer.from(wire);
  const c: Cursor = { off: 0 };
  const type = readSshString(buf, c);
  if (!type || type.toString() !== ED25519_KEY_TYPE) return null;
  const pub = readSshString(buf, c);
  if (!pub || pub.length !== 32) return null;
  return new Uint8Array(pub);
}

/** Decode a base64 ssh public key blob into its raw key material bytes. */
export function decodeKeyBytes(keyB64: string): Uint8Array | null {
  let wire: Buffer;
  try {
    wire = Buffer.from(keyB64, "base64");
  } catch {
    return null;
  }
  const c: Cursor = { off: 0 };
  const type = readSshString(wire, c);
  if (!type) return null;
  const blob = readSshString(wire, c);
  return blob ? new Uint8Array(blob) : null;
}

/** "ssh-ed25519 AAAA..." -> 32-byte public key bytes, or null. */
export function pubBytesFromLine(line: string): Uint8Array | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return decodeKeyBytes(parts[1]!);
}

/** Wire-format public key blob -> "ssh-ed25519 AAAA..." authorized_keys line. */
export function wireToAuthorizedLine(wire: Uint8Array): string | null {
  const pub = decodeEd25519Pub(wire);
  if (!pub) return null;
  return `${ED25519_KEY_TYPE} ${Buffer.from(sshWireString(ED25519_KEY_TYPE, pub)).toString("base64")}`;
}

// --- openssh-key-v1 parsing ---

interface OpenSshContainer {
  cipher: string;
  kdf: string;
  kdfOpts: Buffer;
  pubWire: Uint8Array;
  pubBytes: Uint8Array;
  /** Private section; the bytes are ciphertext when `encrypted` is true. */
  privBlob: Buffer;
  encrypted: boolean;
}

/**
 * Parse the openssh-key-v1 container. The embedded public key is always
 * readable, even when the private section is passphrase-encrypted.
 */
function parseOpenSshContainer(raw: string): OpenSshContainer | null {
  const lines = raw.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return null;
  if (nonEmpty[0]!.trim() !== OPENSSH_BEGIN) return null;
  if (nonEmpty[nonEmpty.length - 1]!.trim() !== OPENSSH_END) return null;

  const b64 = nonEmpty
    .slice(1, -1)
    .join("")
    .replace(/\s+/g, "");
  if (b64.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (buf.subarray(0, 15).toString() !== OPENSSH_MAGIC) return null;

  const c: Cursor = { off: 15 };
  const cipher = readSshString(buf, c);
  const kdf = readSshString(buf, c);
  const kdfOpts = readSshString(buf, c);
  if (!cipher || !kdf || !kdfOpts) return null;

  if (c.off + 4 > buf.length) return null;
  const numKeys = buf.readUInt32BE(c.off);
  c.off += 4;
  if (numKeys !== 1) return null;

  const pubWire = readSshString(buf, c);
  const pubBytes = pubWire ? decodeEd25519Pub(pubWire) : null;
  if (!pubWire || !pubBytes) return null;

  const privBlob = readSshString(buf, c);
  if (!privBlob) return null;

  return {
    cipher: cipher.toString(),
    kdf: kdf.toString(),
    kdfOpts,
    pubWire: new Uint8Array(pubWire),
    pubBytes,
    privBlob,
    encrypted: cipher.toString() !== "none" || kdf.toString() !== "none",
  };
}

/** Parse a (decrypted) ed25519 private section and validate it against the public key. */
function parseEd25519PrivBlob(
  privBlob: Buffer,
  pubBytes: Uint8Array
): { seed: Uint8Array; comment: string } | null {
  const pc: Cursor = { off: 0 };
  if (pc.off + 8 > privBlob.length) return null;
  const check1 = privBlob.readUInt32BE(pc.off);
  const check2 = privBlob.readUInt32BE(pc.off + 4);
  pc.off += 8;
  if (check1 !== check2) return null;

  const keyType = readSshString(privBlob, pc);
  if (!keyType || keyType.toString() !== ED25519_KEY_TYPE) return null;

  const innerPub = readSshString(privBlob, pc);
  if (!innerPub || Buffer.compare(Buffer.from(innerPub), Buffer.from(pubBytes)) !== 0) {
    return null;
  }

  const priv = readSshString(privBlob, pc);
  if (!priv || priv.length !== 64) return null;
  if (Buffer.compare(Buffer.from(priv.subarray(32, 64)), Buffer.from(pubBytes)) !== 0) {
    return null;
  }

  const comment = readSshString(privBlob, pc);

  return {
    seed: new Uint8Array(priv.subarray(0, 32)),
    comment: comment?.toString() ?? "",
  };
}

export function parseOpenSshPrivateKey(raw: string): OpenSshPrivateKey | null {
  const c = parseOpenSshContainer(raw);
  if (!c) return null;

  if (c.encrypted) {
    return {
      seed: null,
      pubWire: c.pubWire,
      pubBytes: c.pubBytes,
      comment: "",
      encrypted: true,
      cipher: c.cipher,
      kdf: c.kdf,
    };
  }

  const inner = parseEd25519PrivBlob(c.privBlob, c.pubBytes);
  if (!inner) return null;

  return {
    seed: inner.seed,
    pubWire: c.pubWire,
    pubBytes: c.pubBytes,
    comment: inner.comment,
    encrypted: false,
    cipher: "none",
    kdf: "none",
  };
}

export function readOpenSshPrivateKey(filePath: string): OpenSshPrivateKey | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  return parseOpenSshPrivateKey(raw);
}

/**
 * Decrypt a passphrase-protected openssh-key-v1 key. Only the standard OpenSSH
 * scheme is supported: bcrypt_pbkdf key derivation with aes256-ctr. Returns
 * null when the passphrase is wrong, the format is unsupported, or the key
 * was never encrypted.
 */
export function decryptOpenSshPrivateKey(raw: string, passphrase: string): OpenSshPrivateKey | null {
  const c = parseOpenSshContainer(raw);
  if (!c) return null;
  if (!c.encrypted) return parseOpenSshPrivateKey(raw);
  if (c.cipher !== "aes256-ctr" || c.kdf !== "bcrypt") return null;

  const ko: Cursor = { off: 0 };
  const salt = readSshString(c.kdfOpts, ko);
  if (!salt) return null;
  if (ko.off + 4 > c.kdfOpts.length) return null;
  const rounds = c.kdfOpts.readUInt32BE(ko.off);

  const keylen = 48;
  const derived = Buffer.alloc(keylen);
  try {
    bcryptPbkdf.pbkdf(
      Buffer.from(passphrase),
      Buffer.byteLength(passphrase),
      salt,
      salt.length,
      derived,
      keylen,
      rounds
    );
  } catch {
    return null;
  }

  let plain: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-ctr", derived.subarray(0, 32), derived.subarray(32, 48));
    plain = Buffer.concat([decipher.update(c.privBlob), decipher.final()]);
  } catch {
    return null;
  }

  const inner = parseEd25519PrivBlob(plain, c.pubBytes);
  if (!inner) return null;

  return {
    seed: inner.seed,
    pubWire: c.pubWire,
    pubBytes: c.pubBytes,
    comment: inner.comment,
    encrypted: false,
    cipher: "none",
    kdf: "none",
  };
}

export function decryptOpenSshPrivateKeyFile(filePath: string, passphrase: string): OpenSshPrivateKey | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  return decryptOpenSshPrivateKey(raw, passphrase);
}

// --- local discovery ---

function parsePubKey(content: string, source: string): SshPublicKey | null {
  const parts = content.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return {
    type: parts[0]!,
    key: parts[1]!,
    comment: parts[2],
    source,
    pubBytes: decodeKeyBytes(parts[1]!) ?? undefined,
  };
}

function keyFromPrivateFile(filePath: string): SshPublicKey | null {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat || stat.size > MAX_KEY_FILE_SIZE) return null;
  const parsed = readOpenSshPrivateKey(filePath);
  if (!parsed) return null;
  const pubLine = wireToAuthorizedLine(parsed.pubWire);
  if (!pubLine) return null;
  const parts = pubLine.trim().split(/\s+/);
  return {
    type: ED25519_KEY_TYPE,
    key: parts[1]!,
    source: filePath,
    pubBytes: parsed.pubBytes,
    hasPrivate: true,
    encrypted: parsed.encrypted,
  };
}

function keyFromPubFile(pubPath: string): SshPublicKey | null {
  let content: string;
  try {
    content = fs.readFileSync(pubPath, "utf8");
  } catch {
    return null;
  }
  const pub = parsePubKey(content, pubPath);
  if (!pub || pub.type !== ED25519_KEY_TYPE) return null;

  const privPath = pubPath.replace(/\.pub$/, "");
  const priv = keyFromPrivateFile(privPath);
  if (!priv) return { ...pub, hasPrivate: false };
  return { ...priv, comment: pub.comment };
}

async function agentKeys(): Promise<SshPublicKey[]> {
  const sock = process.env.SSH_AUTH_SOCK;
  if (sock && !fs.existsSync(sock)) return [];
  try {
    const { stdout } = await execFileAsync("ssh-add", ["-L"], { timeout: 3000 });
    const out: SshPublicKey[] = [];
    for (const line of stdout.split("\n")) {
      const parsed = parsePubKey(line, "agent");
      if (parsed && parsed.type === ED25519_KEY_TYPE) {
        out.push({ ...parsed, hasPrivate: true });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Scan local SSH keys: every regular file in the SSH dir is inspected — `.pub`
 * files are read directly, everything else is parsed as an OpenSSH private key
 * (the embedded public key is extracted, no subprocesses involved). Keys loaded
 * into the SSH agent are included too. Only keys whose private half is actually
 * present are returned.
 */
export async function discoverLocalKeys(sshDir: string = SSH_DIR): Promise<SshPublicKey[]> {
  const keys = new Map<string, SshPublicKey>();
  const add = (k: SshPublicKey | null) => {
    if (k && k.hasPrivate && !keys.has(k.key)) keys.set(k.key, k);
  };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sshDir, { withFileTypes: true });
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (NON_KEY_FILES.has(entry.name)) continue;
    const full = path.join(sshDir, entry.name);
    if (entry.name.endsWith(".pub")) {
      add(keyFromPubFile(full));
    } else {
      add(keyFromPrivateFile(full));
    }
  }

  for (const agentKey of await agentKeys()) {
    add(agentKey);
  }

  return [...keys.values()];
}

// --- matching ---

export function keyMatches(local: SshPublicKey, remote: SshPublicKey): boolean {
  if (local.type !== remote.type) return false;
  const l = local.pubBytes ?? decodeKeyBytes(local.key);
  const r = remote.pubBytes ?? decodeKeyBytes(remote.key);
  if (l && r && l.length === r.length) {
    return Buffer.compare(Buffer.from(l), Buffer.from(r)) === 0;
  }
  return local.key === remote.key;
}

/**
 * Determine whether the current machine holds the private key for a given
 * GitHub public SSH key. Compares the actual public-key bytes, so key naming
 * conventions don't matter. Also works for passphrase-protected keys (the
 * public half of an openssh-key-v1 blob is never encrypted).
 */
export async function findLocalKeyForPublicKey(
  githubKey: string,
  sshDir: string = SSH_DIR
): Promise<SshPublicKey | null> {
  const target = pubBytesFromLine(githubKey);
  if (!target) return null;
  const keys = await discoverLocalKeys(sshDir);
  for (const k of keys) {
    if (k.pubBytes && Buffer.compare(Buffer.from(k.pubBytes), Buffer.from(target)) === 0) {
      return k;
    }
  }
  return null;
}

export async function hasMatchingPrivateKey(githubKey: string): Promise<boolean> {
  return (await findLocalKeyForPublicKey(githubKey)) !== null;
}

export async function findEncryptedLocalKeys(sshDir: string = SSH_DIR): Promise<SshPublicKey[]> {
  const keys = await discoverLocalKeys(sshDir);
  return keys.filter((k) => k.encrypted);
}

export async function hasLocalEd25519Key(sshDir: string = SSH_DIR): Promise<boolean> {
  const keys = await discoverLocalKeys(sshDir);
  return keys.some((k) => k.type === ED25519_KEY_TYPE);
}

/** Human-readable guidance when the machine has no usable ed25519 key, or null. */
export async function noEd25519KeyHint(sshDir: string = SSH_DIR): Promise<string | null> {
  if (await hasLocalEd25519Key(sshDir)) return null;
  return generateHelp();
}

/** Human-readable guidance when the user's local key is passphrase-protected, or null. */
export async function localKeyUnlockHint(): Promise<string | null> {
  const encrypted = await findEncryptedLocalKeys();
  if (encrypted.length === 0) return null;
  const key = encrypted[0]!;
  const name = path.basename(key.source);
  return (
    `Your SSH key "${name}" is passphrase-protected.\n` +
    `Enter its passphrase when nspt prompts you, or remove the passphrase entirely:\n` +
    `ssh-keygen -p -f ${key.source}`
  );
}

export async function tallyKeys(
  username: string,
  sshDir: string = SSH_DIR
): Promise<{ local: SshPublicKey[]; github: SshPublicKey[]; matched: SshPublicKey[] }> {
  const [localKeys, githubKeysRaw] = await Promise.all([
    discoverLocalKeys(sshDir),
    fetchUserKeys(username),
  ]);

  const github: SshPublicKey[] = githubKeysRaw.map((k) => {
    const parts = k.key.split(/\s+/);
    return {
      type: parts[0]!,
      key: parts[1]!,
      comment: k.title,
      source: `github:${username}`,
      pubBytes: decodeKeyBytes(parts[1]!) ?? undefined,
    };
  });

  const matched: SshPublicKey[] = [];
  for (const local of localKeys) {
    if (github.some((remote) => keyMatches(local, remote))) {
      matched.push(local);
    }
  }

  return { local: localKeys, github, matched };
}
