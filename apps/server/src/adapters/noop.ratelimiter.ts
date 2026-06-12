import type { RateLimiter, RateLimitResult } from "@ouroboros/core";

/** Self-hosted default: no rate limiting (single-tenant trust boundary). */
export class NoopRateLimiter implements RateLimiter {
  readonly kind = "noop" as const;
  async limit(_key: string): Promise<RateLimitResult> {
    return { success: true };
  }
}
