import { describe, it, expect, vi } from "vitest";
import { dailyLogFile, Logger } from "../logging/logger";
import type { LogStore } from "../ports/logstore";

function mockStore(): LogStore & { files: string[] } {
  const files: string[] = [];
  return {
    kind: "r2",
    files,
    async append(file: string, _line: string) {
      files.push(file);
    },
    async list() {
      return [...new Set(files)];
    },
    async read() {
      return "";
    },
  };
}

describe("dailyLogFile", () => {
  it("appends UTC date before .log", () => {
    const now = new Date("2026-07-26T15:30:00.000Z");
    expect(dailyLogFile("ouroboros.log", now)).toBe("ouroboros-2026-07-26.log");
    expect(dailyLogFile("ouroboros", now)).toBe("ouroboros-2026-07-26.log");
  });

  it("does not double-date an already dated name", () => {
    const now = new Date("2026-07-27T00:00:00.000Z");
    expect(dailyLogFile("ouroboros-2026-07-26.log", now)).toBe("ouroboros-2026-07-26.log");
  });

  it("uses UTC even when local time is previous day", () => {
    // 2026-07-26 01:00 JST = 2026-07-25 16:00 UTC
    const now = new Date("2026-07-25T16:00:00.000Z");
    expect(dailyLogFile("ouroboros", now)).toBe("ouroboros-2026-07-25.log");
  });
});

describe("Logger daily rotation", () => {
  it("writes to a date-stamped file", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const store = mockStore();
    const log = new Logger(store, { file: "ouroboros", persistLevel: "info" });
    await log.info("hello");
    expect(store.files).toEqual(["ouroboros-2026-03-15.log"]);
    vi.useRealTimers();
  });

  it("switches file after UTC midnight", async () => {
    vi.useFakeTimers();
    const store = mockStore();
    const log = new Logger(store, { file: "ouroboros.log", persistLevel: "info" });

    vi.setSystemTime(new Date("2026-03-15T23:59:00.000Z"));
    await log.info("before");
    vi.setSystemTime(new Date("2026-03-16T00:01:00.000Z"));
    await log.info("after");

    expect(store.files).toEqual(["ouroboros-2026-03-15.log", "ouroboros-2026-03-16.log"]);
    vi.useRealTimers();
  });
});
