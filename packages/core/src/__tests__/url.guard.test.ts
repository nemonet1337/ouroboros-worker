import { describe, it, expect } from "vitest";
import { validateWebhookUrl } from "../webhook/url.guard";

describe("validateWebhookUrl (SSRF guard)", () => {
  it("accepts public https URLs", () => {
    expect(() => validateWebhookUrl("https://hooks.example.com/abc")).not.toThrow();
    expect(() => validateWebhookUrl("http://example.org/webhook")).not.toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => validateWebhookUrl("ftp://example.com")).toThrow();
    expect(() => validateWebhookUrl("file:///etc/passwd")).toThrow();
  });

  it("rejects loopback and unspecified hosts", () => {
    expect(() => validateWebhookUrl("http://localhost/x")).toThrow();
    expect(() => validateWebhookUrl("http://127.0.0.1/x")).toThrow();
    expect(() => validateWebhookUrl("http://0.0.0.0/x")).toThrow();
  });

  it("rejects private IPv4 ranges", () => {
    expect(() => validateWebhookUrl("http://10.0.0.1/x")).toThrow();
    expect(() => validateWebhookUrl("http://192.168.1.1/x")).toThrow();
    expect(() => validateWebhookUrl("http://172.16.0.1/x")).toThrow();
    expect(() => validateWebhookUrl("http://169.254.169.254/latest/meta-data")).toThrow();
  });

  it("rejects IPv6 loopback and link-local", () => {
    expect(() => validateWebhookUrl("http://[::1]/x")).toThrow();
    expect(() => validateWebhookUrl("http://[fe80::1]/x")).toThrow();
  });

  it("rejects malformed URLs", () => {
    expect(() => validateWebhookUrl("not a url")).toThrow();
  });
});
