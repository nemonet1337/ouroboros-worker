import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../utils/crypto";

describe("Crypto Utils", () => {
  it("should encrypt and decrypt correctly", async () => {
    const text = "my-secret-token-123";
    const secretKey = "test-secret-key";
    
    const encrypted = await encrypt(text, secretKey);
    expect(encrypted).not.toBe(text);
    expect(encrypted.length).toBeGreaterThan(20);
    
    const decrypted = await decrypt(encrypted, secretKey);
    expect(decrypted).toBe(text);
  });

  it("should fallback to plain text if decryption fails", async () => {
    const plainText = "plain-text-data";
    const decrypted = await decrypt(plainText, "some-key");
    // Fallback: raw string is returned if it wasn't encrypted
    expect(decrypted).toBe(plainText);
  });
});
