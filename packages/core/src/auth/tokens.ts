// Scoped API tokens + opaque session ids. The token secret is shown once at
// creation; only its SHA-256 hash is persisted.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomBase62(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let out = "";
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export interface GeneratedToken {
  /** Full secret, returned to the user exactly once. */
  secret: string;
  /** SHA-256 hex of the secret, stored in the DB. */
  hash: string;
  /** Display prefix, e.g. "ouro_a1b2c3d4". */
  prefix: string;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input) as BufferSource;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateApiToken(): Promise<GeneratedToken> {
  const secret = `ouro_${randomBase62(40)}`;
  const hash = await sha256Hex(secret);
  return { secret, hash, prefix: secret.slice(0, 13) };
}

export function newSessionId(): string {
  return randomBase62(48);
}

export function newId(): string {
  return crypto.randomUUID();
}

export const KNOWN_SCOPES = ["read", "inspect", "heal", "admin"] as const;
export type Scope = (typeof KNOWN_SCOPES)[number];

export function parseScopes(csv: string): Scope[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Scope => (KNOWN_SCOPES as readonly string[]).includes(s));
}

export function hasScope(tokenScopes: string, required: Scope): boolean {
  const scopes = parseScopes(tokenScopes);
  return scopes.includes("admin") || scopes.includes(required);
}
