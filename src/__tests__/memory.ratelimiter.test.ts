import { describe, it, expect, afterEach, vi } from "vitest";
import { MemoryRateLimiter } from "../adapters/memory.ratelimiter";

afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryRateLimiter", () => {
  it("allows up to the limit inside one window", async () => {
    const rl = new MemoryRateLimiter(60_000, 3);
    try {
      expect((await rl.limit("k")).success).toBe(true);
      expect((await rl.limit("k")).success).toBe(true);
      expect((await rl.limit("k")).success).toBe(true);
      expect((await rl.limit("k")).success).toBe(false);
      expect(rl.current("k")).toBe(4);
    } finally {
      rl.close();
    }
  });

  it("keys windows per identifier", async () => {
    const rl = new MemoryRateLimiter(60_000, 1);
    try {
      expect((await rl.limit("a")).success).toBe(true);
      expect((await rl.limit("b")).success).toBe(true);
      expect((await rl.limit("a")).success).toBe(false);
    } finally {
      rl.close();
    }
  });

  it("resets the window once it has expired", async () => {
    vi.useFakeTimers();
    const rl = new MemoryRateLimiter(1_000, 1);
    try {
      expect((await rl.limit("k")).success).toBe(true);
      expect((await rl.limit("k")).success).toBe(false);
      await vi.advanceTimersByTimeAsync(1_500);
      expect((await rl.limit("k")).success).toBe(true);
      expect(rl.current("k")).toBe(1);
    } finally {
      rl.close();
    }
  });

  it("drops expired entries on the cleanup tick", async () => {
    vi.useFakeTimers();
    const rl = new MemoryRateLimiter(1_000, 5);
    try {
      await rl.limit("k");
      rl.close();
      await vi.advanceTimersByTimeAsync(1_100);
      expect(rl.current("k")).toBe(0);
    } finally {
      rl.close();
    }
  });
});
