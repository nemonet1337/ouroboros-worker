import { Ajv, type JSONSchemaType, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { Context, Next } from "hono";

const ajv = new Ajv({ allErrors: true, removeAdditional: false, coerceTypes: false });
addFormats(ajv);

export class ValidationError extends Error {
  constructor(message: string, readonly details: string[]) {
    super(message);
  }
}

/** Compile a schema once and reuse the validator. */
export function compile<T>(schema: object): ValidateFunction<T> {
  return ajv.compile<T>(schema as JSONSchemaType<T> | object);
}

function formatErrors(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map((e) => {
    const path = e.instancePath || "(root)";
    return `${path} ${e.message ?? "is invalid"}`.trim();
  });
}

/**
 * Hono middleware factory that validates the JSON request body against a schema.
 * On failure responds 400 with the unified error envelope. On success stores the
 * validated body at c.set("body", ...) for the handler to read.
 */
export function validateBody(schema: object) {
  const validate = ajv.compile(schema);
  return async (c: Context, next: Next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: "invalid_json", message: "request body must be valid JSON" } }, 400);
    }
    if (!validate(body)) {
      return c.json(
        { error: { code: "validation_failed", message: "request body is invalid", details: formatErrors(validate) } },
        400
      );
    }
    c.set("body", body);
    await next();
  };
}

// ── Reusable schemas ────────────────────────────────────────────────────────

export const credentialsSchema = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string", format: "email", maxLength: 320 },
    password: { type: "string", minLength: 8, maxLength: 1024 },
  },
} as const;

export const tokenCreateSchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 80 },
    scopes: { type: "array", items: { type: "string", enum: ["read", "inspect", "heal", "admin"] } },
    expiresInDays: { type: "number", minimum: 1, maximum: 3650 },
  },
} as const;

export const inspectSchema = {
  type: "object",
  required: ["files"],
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    language: { type: "string" },
    files: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["path", "content"],
        properties: { path: { type: "string" }, content: { type: "string" } },
      },
    },
    options: {
      type: "object",
      additionalProperties: true,
      properties: {
        granularity: { type: "string", enum: ["file", "function"] },
        enabledCategories: {
          type: "array",
          items: {
            type: "string",
            enum: ["security", "performance", "redundancy", "readability", "design", "correctness"],
          },
        },
        scoreThresholds: { type: "object" },
      },
    },
  },
} as const;

export const webhookCreateSchema = {
  type: "object",
  required: ["url"],
  additionalProperties: true,
  properties: {
    url: { type: "string", format: "uri", maxLength: 2048 },
    type: { type: "string", maxLength: 40 },
    config: { type: "object" },
  },
} as const;

export const webhookPatchSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    enabled: { type: "boolean" },
    url: { type: "string", format: "uri", maxLength: 2048 },
    type: { type: "string", maxLength: 40 },
    config: { type: "object" },
  },
} as const;

export const settingsSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    registrationEnabled: { type: "boolean" },
    weights: { type: "object" },
    gradeThresholds: { type: "object" },
    schedule: { type: "object" },
    notifications: { type: "object" },
  },
} as const;

export const configSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    gitService: { type: "string" },
    gitPackage: { type: "string" },
    gitToken: { type: "string" },
    selectedLanguages: { type: "array", items: { type: "string" } },
    selectedAiService: { type: "string" },
    selectedModelValue: { type: ["string", "null"] },
  },
} as const;
