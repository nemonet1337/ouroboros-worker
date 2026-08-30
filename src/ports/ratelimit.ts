export interface RateLimitResult {
  success: boolean;
}

/**
 * Abstraction over a rate limiter keyed by an arbitrary string (IP, token, user).
 * Implementation: CfRateLimiter (Workers Rate Limiting API; always-allow if unbound).
 */
export interface RateLimiter {
  readonly kind: "cf";
  limit(key: string): Promise<RateLimitResult>;
}
