export interface RateLimitResult {
  success: boolean;
}

interface Entry {
  count: number;
  expiresAt: number;
}

/** 固定窗口レートリミッタ。期限切れエントリは定期的に掃除する。 */
export class MemoryRateLimiter {
  readonly windowMs: number;
  readonly maxRequests: number;
  #map = new Map<string, Entry>();
  #timer?: NodeJS.Timeout;

  constructor(windowMs = 60_000, maxRequests = 120) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.#timer = setInterval(() => this.#cleanup(), windowMs);
    this.#timer.unref?.();
  }

  async limit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.#map.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.#map.set(key, { count: 1, expiresAt: now + this.windowMs });
      return { success: true };
    }
    entry.count += 1;
    return { success: entry.count <= this.maxRequests };
  }

  /** テスト・shutdown 用に現在のカウントを読む。 */
  current(key: string): number {
    const entry = this.#map.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return 0;
    return entry.count;
  }

  close(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.#map) {
      if (entry.expiresAt <= now) this.#map.delete(key);
    }
  }
}
