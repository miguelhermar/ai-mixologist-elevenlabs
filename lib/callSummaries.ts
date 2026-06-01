/**
 * Store for post-call analytics summaries (Phase 5). Backs the `/api/post-call`
 * webhook sink and the `/summary` page.
 *
 * Two interchangeable backends, selected purely by configuration:
 *   - **Upstash Redis** when configured (production / serverless): a hash at
 *     `last-call:call-summaries`, field = `conversationId`, value = summary JSON.
 *     The hash makes the per-conversation upsert native.
 *   - **Local JSON file** otherwise (`npm run dev`, tests): a single gitignored
 *     file, read-modify-write, inspectable and restart-surviving.
 *
 * Writes are idempotent per conversation: re-delivering the same webhook (or a
 * retry) upserts by `conversationId` rather than duplicating, so the summary list
 * stays clean even though ElevenLabs may retry on a slow ack.
 */

import { promises as fs } from "fs";
import path from "path";
import { createLogger } from "@/lib/logger";
import { getRedis, KV_PREFIX } from "@/lib/kv";
import type { CallSummary } from "@/lib/postcall";

const log = createLogger("call-summaries");

/** Redis hash of summaries, keyed by `conversationId` (native idempotent upsert). */
const REDIS_KEY = `${KV_PREFIX}:call-summaries`;

/** Default store location (gitignored). Overridable for tests via the `filePath` arg. */
export function defaultCallSummariesPath(): string {
  return path.join(process.cwd(), ".data", "call-summaries.json");
}

/** Newest-first sort used by both backends. */
function newestFirst(summaries: CallSummary[]): CallSummary[] {
  return [...summaries].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

async function readRaw(filePath: string): Promise<CallSummary[]> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as { summaries?: CallSummary[] };
    return Array.isArray(parsed.summaries) ? parsed.summaries : [];
  } catch (err) {
    // Missing file (first write) is expected — start empty. Re-throw anything else.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Read summaries from the Redis hash (empty if unset). */
async function readRedis(): Promise<CallSummary[]> {
  const redis = getRedis();
  if (!redis) return [];
  // hgetall returns { conversationId: CallSummary } (values auto-deserialized).
  const map = await redis.hgetall<Record<string, CallSummary>>(REDIS_KEY);
  return map ? Object.values(map) : [];
}

/** Read all summaries, newest first (empty array if the store doesn't exist yet). */
export async function readCallSummaries(
  filePath = defaultCallSummariesPath()
): Promise<CallSummary[]> {
  if (getRedis()) return newestFirst(await readRedis());
  return newestFirst(await readRaw(filePath));
}

/**
 * Upsert a call summary (keyed by `conversationId`) and return the updated list.
 * Uses Redis when configured, else the local JSON file (created on first write).
 */
export async function saveCallSummary(
  summary: CallSummary,
  filePath = defaultCallSummariesPath()
): Promise<CallSummary[]> {
  const redis = getRedis();
  if (redis) {
    await redis.hset(REDIS_KEY, { [summary.conversationId]: summary });
    log.debug("call summary upserted (redis)", {
      conversationId: summary.conversationId,
    });
    return newestFirst(await readRedis());
  }

  const summaries = await readRaw(filePath);
  const idx = summaries.findIndex((s) => s.conversationId === summary.conversationId);
  if (idx >= 0) {
    summaries[idx] = summary;
    log.debug("call summary updated", { conversationId: summary.conversationId });
  } else {
    summaries.push(summary);
    log.debug("call summary added", {
      conversationId: summary.conversationId,
      count: summaries.length,
    });
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ summaries }, null, 2), "utf8");
  return summaries;
}
