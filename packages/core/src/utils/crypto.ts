import { Buffer } from "node:buffer";

const ALGORITHM = "AES-GCM";
const DEFAULT_SECRET = "ouroboros-default-secret-key-change-me";

// Generate a 256-bit CryptoKey by hashing the secret string
async function getEncryptionKey(secretKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secretKey));
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plaintext string using AES-GCM
 */
export async function encrypt(text: string, secretKey = process.env.OURO_ENCRYPTION_KEY ?? DEFAULT_SECRET): Promise<string> {
  if (!text) return "";
  const key = await getEncryptionKey(secretKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  
  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypt an AES-GCM encrypted base64 string
 */
export async function decrypt(encryptedBase64: string, secretKey = process.env.OURO_ENCRYPTION_KEY ?? DEFAULT_SECRET): Promise<string> {
  if (!encryptedBase64) return "";
  try {
    const key = await getEncryptionKey(secretKey);
    const combined = Buffer.from(encryptedBase64, "base64");
    if (combined.length < 12) throw new Error("Invalid ciphertext length");
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);
    
    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    // Fallback: if decryption fails (e.g. legacy plain text), return raw string
    return encryptedBase64;
  }
}
