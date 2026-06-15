export interface RateLimitResult {
  success: boolean;
}

/**
 * Abstraction over a rate limiter keyed by an arbitrary string (IP, token, user).
 * Implementations: NoopLimiter (self-hosted default), CfRateLimiter (Workers
 * Rate Limiting API binding).
 */
export interface RateLimiter {
  readonly kind: "noop" | "cf";
  limit(key: string): Promise<RateLimitResult>;
}
