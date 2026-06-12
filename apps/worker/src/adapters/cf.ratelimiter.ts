import type { RateLimiter, RateLimitResult } from "@ouroboros/core";
import type { RateLimit } from "../env";

/** RateLimiter backed by the Cloudflare Workers Rate Limiting API binding. */
export class CfRateLimiter implements RateLimiter {
  readonly kind = "cf" as const;

  constructor(private readonly binding: RateLimit) {}

  async limit(key: string): Promise<RateLimitResult> {
    const { success } = await this.binding.limit({ key });
    return { success };
  }
}
