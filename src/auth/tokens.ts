// Opaque session ids and request ids.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomBase62(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let out = "";
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function newSessionId(): string {
  return randomBase62(48);
}

export function newId(): string {
  return crypto.randomUUID();
}
