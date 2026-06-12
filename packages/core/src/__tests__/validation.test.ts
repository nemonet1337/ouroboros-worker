import { describe, it, expect } from "vitest";
import {
  compile,
  credentialsSchema,
  tokenCreateSchema,
  inspectSchema,
  webhookCreateSchema,
} from "../http/validation";

describe("request validation schemas", () => {
  it("credentials require valid email and 8+ char password", () => {
    const v = compile(credentialsSchema);
    expect(v({ email: "a@b.io", password: "supersecret" })).toBe(true);
    expect(v({ email: "not-an-email", password: "supersecret" })).toBe(false);
    expect(v({ email: "a@b.io", password: "short" })).toBe(false);
    expect(v({ email: "a@b.io" })).toBe(false);
  });

  it("token scopes are restricted to the known set", () => {
    const v = compile(tokenCreateSchema);
    expect(v({ name: "ci", scopes: ["read", "heal"] })).toBe(true);
    expect(v({ name: "ci", scopes: ["superuser"] })).toBe(false);
    expect(v({ scopes: ["read"] })).toBe(false); // name required
  });

  it("inspect requires at least one file with path+content", () => {
    const v = compile(inspectSchema);
    expect(v({ language: "typescript", files: [{ path: "a.ts", content: "x" }] })).toBe(true);
    expect(v({ files: [] })).toBe(false);
    expect(v({ files: [{ path: "a.ts" }] })).toBe(false);
  });

  it("webhook create requires a uri-format url", () => {
    const v = compile(webhookCreateSchema);
    expect(v({ url: "https://hooks.example.com/x", type: "slack" })).toBe(true);
    expect(v({ type: "slack" })).toBe(false);
  });
});
