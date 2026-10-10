export interface RateLimitResult {
  success: boolean;
}

/**
 * Abstraction over a rate limiter keyed by an arbitrary string (IP, token, user).
 * Implementation: MemoryRateLimiter (fixed window).
 */
export interface RateLimiter {
  readonly kind: "memory";
  limit(key: string): Promise<RateLimitResult>;
}
