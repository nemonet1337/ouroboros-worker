import { describe, it, expect, vi } from "vitest";
import { MemoryQueue } from "../adapters/memory.queue";
import type { GuiEvent } from "../ports/queue";

function event(id: string): GuiEvent {
  return { id, type: "inspection.requested", payload: {}, enqueuedAt: Date.now() };
}

function flush(ms = 40): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("MemoryQueue", () => {
  it("processes events one at a time in order", async () => {
    const order: string[] = [];
    let active = 0;
    let sawOverlap = false;
    const q = new MemoryQueue({
      onEvent: async (e) => {
        active++;
        if (active > 1) sawOverlap = true;
        await flush(5);
        order.push(e.id);
        active--;
      },
    });

    await Promise.all([q.send(event("a")), q.send(event("b")), q.send(event("c"))]);
    await q.drain(2000);

    expect(order).toEqual(["a", "b", "c"]);
    expect(sawOverlap).toBe(false);
  });

  it("retries a failing event up to the max and then logs", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const q = new MemoryQueue({ onEvent: handler });

    await q.send(event("a"));
    await q.drain(5000);

    expect(handler).toHaveBeenCalledTimes(MemoryQueue.MAX_RETRIES);
    expect(warn).toHaveBeenCalledTimes(MemoryQueue.MAX_RETRIES - 1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("failed after retries"), "inspection.requested", expect.anything());
    error.mockRestore();
    warn.mockRestore();
  });

  it("recovers when a later attempt succeeds", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(undefined);
    const q = new MemoryQueue({ onEvent: handler });

    await q.send(event("a"));
    await q.drain(5000);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("drops new events after stop", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const q = new MemoryQueue({ onEvent: handler });

    q.stop();
    await q.send(event("a"));
    await flush(30);

    expect(handler).not.toHaveBeenCalled();
  });
});
