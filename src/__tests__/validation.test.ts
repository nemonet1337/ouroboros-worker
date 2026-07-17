import { describe, it, expect } from "vitest";
import {
  credentialsSchema,
  profileUpdateSchema,
  inspectSchema,
  webhookCreateSchema,
} from "../http/validation";

const ok = (v: { ok: boolean }) => v.ok;

describe("request validation schemas", () => {
  it("credentials require valid email and 8+ char password", () => {
    expect(ok(credentialsSchema({ email: "a@b.io", password: "supersecret" }))).toBe(true);
    expect(ok(credentialsSchema({ email: "not-an-email", password: "supersecret" }))).toBe(false);
    expect(ok(credentialsSchema({ email: "a@b.io", password: "short" }))).toBe(false);
    expect(ok(credentialsSchema({ email: "a@b.io" }))).toBe(false);
  });

  it("profile update requires valid email and optional 8+ char password", () => {
    expect(ok(profileUpdateSchema({ email: "a@b.io" }))).toBe(true);
    expect(ok(profileUpdateSchema({ email: "a@b.io", password: "supersecret" }))).toBe(true);
    expect(ok(profileUpdateSchema({ email: "not-an-email" }))).toBe(false);
    expect(ok(profileUpdateSchema({ email: "a@b.io", password: "short" }))).toBe(false);
  });

  it("inspect requires at least one file with path+content", () => {
    expect(ok(inspectSchema({ language: "typescript", files: [{ path: "a.ts", content: "x" }] }))).toBe(true);
    expect(ok(inspectSchema({ files: [] }))).toBe(false);
    expect(ok(inspectSchema({ files: [{ path: "a.ts" }] }))).toBe(false);
  });

  it("webhook create requires a http/https url", () => {
    expect(ok(webhookCreateSchema({ url: "https://hooks.example.com/x", type: "slack" }))).toBe(true);
    expect(ok(webhookCreateSchema({ type: "slack" }))).toBe(false);
  });
});
