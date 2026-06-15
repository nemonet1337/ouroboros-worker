/**
 * Request body validation without eval/new Function so it runs in
 * Cloudflare Workers (which forbids code generation from strings).
 * Each validator is a plain TypeScript function — no AJV, no JSON Schema.
 */
import type { Context, Next } from "hono";

export class ValidationError extends Error {
  constructor(message: string, readonly details: string[]) {
    super(message);
  }
}

type Validator<T> = (body: unknown) => { ok: true; value: T } | { ok: false; errors: string[] };

export function validateBody<T>(validator: Validator<T>) {
  return async (c: Context, next: Next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: "invalid_json", message: "request body must be valid JSON" } }, 400);
    }
    const result = validator(body);
    if (!result.ok) {
      return c.json(
        { error: { code: "validation_failed", message: "request body is invalid", details: result.errors } },
        400
      );
    }
    c.set("body", result.value);
    await next();
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URI_RE = /^https?:\/\/.+/;

// ── Validators ───────────────────────────────────────────────────────────────

export const credentialsSchema: Validator<{ email: string; password: string }> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors: string[] = [];
  if (typeof body.email !== "string" || !EMAIL_RE.test(body.email) || body.email.length > 320)
    errors.push("email must be a valid email address (max 320 chars)");
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 1024)
    errors.push("password must be a string between 8 and 1024 characters");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { email: body.email as string, password: body.password as string } };
};

export const profileUpdateSchema: Validator<{ email: string; password?: string }> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors: string[] = [];
  if (typeof body.email !== "string" || !EMAIL_RE.test(body.email) || body.email.length > 320)
    errors.push("email must be a valid email address (max 320 chars)");
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 1024)
      errors.push("password must be a string between 8 and 1024 characters");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { email: body.email as string, password: body.password as string | undefined } };
};

const VALID_SCOPES = new Set(["read", "inspect", "heal", "admin"]);

export const tokenCreateSchema: Validator<{ name: string; scopes?: string[]; expiresInDays?: number }> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors: string[] = [];
  if (typeof body.name !== "string" || body.name.length < 1 || body.name.length > 80)
    errors.push("name must be a string between 1 and 80 characters");
  if (body.scopes !== undefined) {
    if (!Array.isArray(body.scopes) || body.scopes.some((s) => !VALID_SCOPES.has(s)))
      errors.push("scopes must be an array of: read, inspect, heal, admin");
  }
  if (body.expiresInDays !== undefined) {
    if (typeof body.expiresInDays !== "number" || body.expiresInDays < 1 || body.expiresInDays > 3650)
      errors.push("expiresInDays must be a number between 1 and 3650");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body as { name: string; scopes?: string[]; expiresInDays?: number } };
};

export const inspectSchema: Validator<Record<string, unknown>> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors: string[] = [];
  if (!Array.isArray(body.files) || body.files.length === 0)
    errors.push("files must be a non-empty array");
  else if (body.files.some((f: unknown) => !isObj(f) || typeof (f as any).path !== "string" || typeof (f as any).content !== "string"))
    errors.push("each file must have string path and content");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body };
};

export const webhookCreateSchema: Validator<Record<string, unknown>> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors: string[] = [];
  if (typeof body.url !== "string" || !URI_RE.test(body.url) || body.url.length > 2048)
    errors.push("url must be a valid http/https URL (max 2048 chars)");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body };
};

export const webhookPatchSchema: Validator<Record<string, unknown>> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors: string[] = [];
  if (body.url !== undefined && (typeof body.url !== "string" || !URI_RE.test(body.url) || body.url.length > 2048))
    errors.push("url must be a valid http/https URL (max 2048 chars)");
  if (body.enabled !== undefined && typeof body.enabled !== "boolean")
    errors.push("enabled must be a boolean");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body };
};

export const settingsSchema: Validator<Record<string, unknown>> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  if (body.registrationEnabled !== undefined && typeof body.registrationEnabled !== "boolean")
    return { ok: false, errors: ["registrationEnabled must be a boolean"] };
  return { ok: true, value: body };
};

export const configSchema: Validator<Record<string, unknown>> = (body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  return { ok: true, value: body };
};
