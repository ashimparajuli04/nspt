import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// const key = randomBytes(32); // 256-bit symmetric file key

// // --- encrypt ---
// const iv = randomBytes(12); // unique per encryption, stored alongside
// const cipher = createCipheriv("aes-256-gcm", key, iv);
// const plaintext = readFileSync(".env");
// const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
// const tag = cipher.getAuthTag(); // GCM integrity tag, 16 bytes

// // pack as [iv (12) | tag (16) | ciphertext] so decrypt has everything
// writeFileSync(".env.enc", Buffer.concat([iv, tag, ciphertext]));

// // --- decrypt ---
// const data = readFileSync(".env.enc");
// const decIv = data.subarray(0, 12);
// const decTag = data.subarray(12, 28);
// const decCiphertext = data.subarray(28);

// const decipher = createDecipheriv("aes-256-gcm", key, decIv);
// decipher.setAuthTag(decTag);
// const restored = Buffer.concat([decipher.update(decCiphertext), decipher.final()]);
// writeFileSync(".env", restored);

export function generateKey() {
    return randomBytes(32);
}

export function encryptFile(key: Buffer, plaintext: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptFile(key: Buffer, ciphertext: Buffer): Buffer {
    const decIv = ciphertext.subarray(0, 12);
    const decTag = ciphertext.subarray(12, 28);
    const decCiphertext = ciphertext.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, decIv);
    decipher.setAuthTag(decTag);
    return Buffer.concat([decipher.update(decCiphertext), decipher.final()]);
}
