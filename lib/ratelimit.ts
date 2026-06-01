/**
 * Per-IP rate limiting for the credit-spending `/api/signed-url` route.
 *
 * The app has no login by design, so the signed-url endpoint is public — and
 * every call mints a voice session that consumes ElevenLabs quota. Without a
 * limit, a bot or abuser could drain the monthly quota and break the app for
 * everyone. This caps how many sessions one IP can start in a window.
 *
 * Backed by Upstash Redis (sliding window). When Redis isn't configured (local
 * dev / tests), it degrades to a no-op "always allowed" so it never gets in the
 * way — the limit only matters in the public production deployment.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/kv";
import { createLogger } from "@/lib/logger";

const log = createLogger("ratelimit");

/** Sessions allowed per IP per window. Tunable via env (default 5 / 60s). */
function limitConfig(): { tokens: number; window: `${number} s` } {
  const tokens = Number(process.env.SIGNED_URL_RATE_LIMIT ?? 5);
  const seconds = Number(process.env.SIGNED_URL_RATE_WINDOW_SECONDS ?? 60);
  return {
    tokens: Number.isFinite(tokens) && tokens > 0 ? tokens : 5,
    window: `${Number.isFinite(seconds) && seconds > 0 ? seconds : 60} s`,
  };
}

let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;
  const redis = getRedis();
  if (!redis) return null;
  const { tokens, window } = limitConfig();
  limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: "last-call:ratelimit:signed-url",
    analytics: false,
  });
  log.info("rate limiter active", { tokens, window });
  return limiter;
}

export interface RateLimitResult {
  /** False only when the caller has exceeded the window's allowance. */
  success: boolean;
  /** Remaining allowance in the current window (undefined when limiting is off). */
  remaining?: number;
}

/**
 * Checks whether a request from `identifier` (typically the client IP) is allowed.
 * Returns `{ success: true }` immediately when rate limiting is disabled.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const rl = getLimiter();
  if (!rl) return { success: true };
  const { success, remaining } = await rl.limit(identifier);
  if (!success) log.warn("rate limit exceeded", { identifier });
  return { success, remaining };
}

/**
 * Best-effort client IP from proxy headers (Vercel/most hosts set
 * `x-forwarded-for`). Falls back to a constant bucket so a missing header can't
 * bypass the limit entirely.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
