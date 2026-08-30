const ALGORITHM = "AES-GCM";

async function getEncryptionKey(secretKey: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secretKey));
  return crypto.subtle.importKey("raw", hash, { name: ALGORITHM }, false, ["encrypt", "decrypt"]);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** AES-GCM. `secretKey` is OURO_ENCRYPTION_KEY — empty key is refused. */
export async function encrypt(text: string, secretKey: string): Promise<string> {
  if (!text) return "";
  if (!secretKey) throw new Error("OURO_ENCRYPTION_KEY is not set");
  const key = await getEncryptionKey(secretKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, new TextEncoder().encode(text));

  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return bytesToB64(combined);
}

/** 復号失敗時はレガシー平文としてそのまま返す。 */
export async function decrypt(encryptedBase64: string, secretKey: string): Promise<string> {
  if (!encryptedBase64) return "";
  if (!secretKey) return encryptedBase64;
  try {
    const key = await getEncryptionKey(secretKey);
    const combined = b64ToBytes(encryptedBase64);
    if (combined.length < 12) throw new Error("Invalid ciphertext length");
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return encryptedBase64;
  }
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
