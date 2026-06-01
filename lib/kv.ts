/**
 * Optional Upstash Redis client (production persistence layer).
 *
 * The app's data stores (favorites, call summaries) default to a local JSON file
 * — fine for `npm run dev` and tests, but a serverless host (Vercel) has a
 * read-only filesystem, so writes must go to a managed store instead.
 *
 * This module returns a Redis client ONLY when the Upstash REST env vars are
 * present (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — set
 * automatically by the Upstash Vercel Marketplace integration). When they're
 * absent (local dev / tests), it returns `null` and callers fall back to the
 * file store. So there is one code path, gated purely on configuration.
 */

import { Redis } from "@upstash/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("kv");

/** Shared key prefix so this app's keys are easy to spot in a shared Upstash db. */
export const KV_PREFIX = "last-call";

/** True when the Upstash REST credentials are configured in the environment. */
export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

let client: Redis | null = null;
let warnedMissing = false;

/**
 * Returns a singleton Redis client when configured, else `null`.
 *
 * Callers treat `null` as "use the file fallback" — this never throws on a
 * missing config, only on a genuinely broken client construction.
 */
export function getRedis(): Redis | null {
  if (client) return client;
  if (!isRedisConfigured()) {
    if (!warnedMissing) {
      // Expected locally; worth a single line so prod misconfig is visible.
      log.debug("Upstash not configured — using local file store");
      warnedMissing = true;
    }
    return null;
  }
  client = Redis.fromEnv();
  log.info("Upstash Redis client initialized");
  return client;
}
