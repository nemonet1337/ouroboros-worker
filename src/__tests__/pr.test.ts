import { describe, it, expect } from "vitest";
import { PRDeduplicator } from "../pr/pr.deduplicator";
import { defaultHealingConfig } from "../config/healing.config";
import { FindingGroup } from "../types";

function makeGroup(id: string): FindingGroup {
  return {
    id,
    priority: "high",
    findings: [],
    autoFixable: true,
    estimatedRisk: "テストリスク",
    fixStrategy: { title: "テスト", steps: [], rationale: "" },
  };
}

describe("PRDeduplicator", () => {
  it("constructs without error", () => {
    expect(new PRDeduplicator(defaultHealingConfig)).toBeDefined();
  });

  it("toSlug converts group id to kebab-case and truncates to 40 chars", () => {
    const dedup = new PRDeduplicator(defaultHealingConfig);
    expect(dedup.toSlug(makeGroup("my-group"))).toBe("my-group");
    // Non-alphanumeric chars → hyphens, consecutive hyphens collapsed, leading/trailing trimmed
    expect(dedup.toSlug(makeGroup("My Group / XYZ!"))).toBe("my-group-xyz");
    expect(dedup.toSlug(makeGroup("a".repeat(50)))).toHaveLength(40);
  });

  it("isDuplicate returns false when no PRs are loaded", () => {
    const dedup = new PRDeduplicator(defaultHealingConfig);
    expect(dedup.isDuplicate(makeGroup("cve-lodash-npm"))).toBe(false);
  });

  it("isDuplicate returns true after matching branch is registered", () => {
    const dedup = new PRDeduplicator(defaultHealingConfig);
    dedup.register("heal/high/cve-lodash-npm-1234567890");
    expect(dedup.isDuplicate(makeGroup("cve-lodash-npm"))).toBe(true);
  });

  it("isDuplicate returns false for non-matching branch", () => {
    const dedup = new PRDeduplicator(defaultHealingConfig);
    dedup.register("heal/high/other-group-9999");
    expect(dedup.isDuplicate(makeGroup("cve-lodash-npm"))).toBe(false);
  });

  it("register accumulates multiple branches", () => {
    const dedup = new PRDeduplicator(defaultHealingConfig);
    dedup.register("heal/high/group-a-111");
    dedup.register("heal/critical/group-b-222");
    expect(dedup.isDuplicate(makeGroup("group-a"))).toBe(true);
    expect(dedup.isDuplicate(makeGroup("group-b"))).toBe(true);
    expect(dedup.isDuplicate(makeGroup("group-c"))).toBe(false);
  });
});
