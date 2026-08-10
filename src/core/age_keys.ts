import * as age from "age-encryption";

export interface AgeIdentity {
  identity: string;
  recipient: string;
}

export async function generateAgeIdentity(): Promise<AgeIdentity> {
  const identity = await age.generateX25519Identity();
  const recipient = await age.identityToRecipient(identity);
  return { identity, recipient };
}

export async function sealToFileKey(
  fileKeyHex: string,
  recipients: string[]
): Promise<string[]> {
  const fileKey = hexToBytes(fileKeyHex);
  const armored: string[] = [];
  for (const recipient of recipients) {
    const e = new age.Encrypter();
    e.addRecipient(recipient);
    const encrypted = await e.encrypt(fileKey);
    armored.push(age.armor.encode(encrypted));
  }
  return armored;
}

export async function unsealFileKey(
  armoredWrapped: string,
  identity: string
): Promise<string | null> {
  try {
    const encrypted = age.armor.decode(armoredWrapped);
    const d = new age.Decrypter();
    d.addIdentity(identity);
    const fileKey = await d.decrypt(encrypted);
    return bytesToHex(fileKey);
  } catch {
    return null;
  }
}

export async function dryRun(): Promise<boolean> {
  try {
    const { identity, recipient } = await generateAgeIdentity();
    const testKey = "0000000000000000000000000000000000000000000000000000000000000001";
    const results = await sealToFileKey(testKey, [recipient]);
    const result = results[0];
    if (!result) return false;
    const unsealed = await unsealFileKey(result, identity);
    return unsealed === testKey;
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
