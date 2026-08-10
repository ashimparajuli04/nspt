import { sha512 } from "@noble/hashes/sha2.js";
import { bech32 } from "@scure/base";
import {
  discoverLocalKeys,
  readOpenSshPrivateKey,
  decryptOpenSshPrivateKeyFile,
  wireToAuthorizedLine,
  decodeEd25519Pub,
  ED25519_KEY_TYPE,
} from "./ssh_keys.js";

const P = 2n ** 255n - 19n;

export interface SshKeyIdentity {
  identity: string;
  recipient: string;
  pubLine: string;
  keyPath: string;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let res = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return res;
}

function modInv(a: bigint, p: bigint): bigint {
  return modPow(((a % p) + p) % p, p - 2n, p);
}

// Birational map from Ed25519 to Curve25519 / X25519: u = (1 + y) / (1 - y) mod p.
// Matches filippo.io/edwards25519 Point.BytesMontgomery, as used by ssh-to-age.
export function ed25519PubToMontgomery(pub: Uint8Array): Uint8Array {
  let y = 0n;
  for (let i = pub.length - 1; i >= 0; i--) {
    let b = pub[i]!;
    if (i === pub.length - 1) b &= 0x7f;
    y = (y << 8n) | BigInt(b);
  }
  let u = ((1n + y) % P) * modInv((1n - y) % P, P);
  u = ((u % P) + P) % P;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number((u >> BigInt(8 * i)) & 0xffn);
  }
  return out;
}

// ssh-ed25519 AAAA... -> native X25519 age recipient (age1...)
export function sshPubB64ToRecipient(keyB64: string): string | null {
  let wire: Uint8Array;
  try {
    wire = Buffer.from(keyB64, "base64");
  } catch {
    return null;
  }
  const pub = decodeEd25519Pub(wire);
  if (!pub) return null;
  return bech32.encodeFromBytes("age", ed25519PubToMontgomery(pub));
}

export function sshPubLineToRecipient(line: string): string | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2 || parts[0] !== ED25519_KEY_TYPE) return null;
  return sshPubB64ToRecipient(parts[1]!);
}

// 32-byte ed25519 seed -> native X25519 age identity (AGE-SECRET-KEY-1...).
// The scalar is sha512(seed)[:32], exactly what Ed25519 itself derives (RFC 8032).
export function sshSeedToIdentity(seed: Uint8Array): string {
  const scalar = sha512(seed).subarray(0, 32);
  return bech32.encodeFromBytes("AGE-SECRET-KEY-", scalar).toUpperCase();
}

// Parse a local OpenSSH ed25519 private key and convert it to an age identity.
// Returns null for passphrase-protected keys (the seed is only derivable after
// decryption); use the ssh_keys module to detect/verify such keys instead.
export function sshIdentityFromFile(filePath: string): SshKeyIdentity | null {
  const parsed = readOpenSshPrivateKey(filePath);
  if (!parsed || parsed.encrypted || !parsed.seed) return null;
  const pubLine = wireToAuthorizedLine(parsed.pubWire);
  if (!pubLine) return null;
  const recipient = sshPubLineToRecipient(pubLine);
  if (!recipient) return null;
  return {
    identity: sshSeedToIdentity(parsed.seed),
    recipient,
    pubLine,
    keyPath: filePath,
  };
}

export async function findLocalSshIdentities(): Promise<SshKeyIdentity[]> {
  const keys = await discoverLocalKeys();
  const out: SshKeyIdentity[] = [];
  for (const key of keys) {
    if (key.type !== ED25519_KEY_TYPE || key.source === "agent") continue;
    const identity = sshIdentityFromFile(key.source);
    if (identity) out.push(identity);
  }
  return out;
}

/** Derive an age identity from a passphrase-protected key by decrypting it in-process. */
export function sshIdentityWithPassphrase(filePath: string, passphrase: string): SshKeyIdentity | null {
  const parsed = decryptOpenSshPrivateKeyFile(filePath, passphrase);
  if (!parsed || parsed.encrypted || !parsed.seed) return null;
  const pubLine = wireToAuthorizedLine(parsed.pubWire);
  if (!pubLine) return null;
  const recipient = sshPubLineToRecipient(pubLine);
  if (!recipient) return null;
  return {
    identity: sshSeedToIdentity(parsed.seed),
    recipient,
    pubLine,
    keyPath: filePath,
  };
}
