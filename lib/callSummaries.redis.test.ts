import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CallSummary } from "./postcall";

/**
 * Exercises the Redis backend of the call-summaries store by mocking the kv
 * client. (The file backend is covered in callSummaries.test.ts.) A tiny
 * in-memory hash stands in for Upstash so we assert the upsert + newest-first
 * read without a network.
 */

const hash = new Map<string, CallSummary>();
const fakeRedis = {
  hset: vi.fn(async (_key: string, obj: Record<string, CallSummary>) => {
    for (const [field, value] of Object.entries(obj)) hash.set(field, value);
    return Object.keys(obj).length;
  }),
  hgetall: vi.fn(async () =>
    hash.size ? Object.fromEntries(hash) : null
  ),
};

vi.mock("@/lib/kv", () => ({
  KV_PREFIX: "last-call",
  isRedisConfigured: () => true,
  getRedis: () => fakeRedis,
}));

import { saveCallSummary, readCallSummaries } from "./callSummaries";

function makeSummary(over: Partial<CallSummary> = {}): CallSummary {
  return {
    conversationId: "conv_1",
    agentId: "agent_1",
    receivedAt: "2026-05-31T12:00:00.000Z",
    eventTimestamp: 1_716_000_000,
    durationSecs: 60,
    callSuccessful: "success",
    summary: "A nice chat.",
    dataCollection: { favorite_cocktail: { value: "Margarita", rationale: "chose it" } },
    evaluations: { complete_recipe: { result: "success", rationale: "ok" } },
    ...over,
  };
}

describe("call summaries store (Redis backend)", () => {
  beforeEach(() => {
    hash.clear();
    fakeRedis.hset.mockClear();
    fakeRedis.hgetall.mockClear();
  });

  it("returns [] when nothing is stored yet", async () => {
    expect(await readCallSummaries()).toEqual([]);
  });

  it("writes to the Redis hash keyed by conversationId", async () => {
    await saveCallSummary(makeSummary());
    expect(fakeRedis.hset).toHaveBeenCalledWith("last-call:call-summaries", {
      conv_1: expect.objectContaining({ conversationId: "conv_1" }),
    });
    const reread = await readCallSummaries();
    expect(reread[0].summary).toBe("A nice chat.");
  });

  it("upserts by conversationId (a retry does not duplicate)", async () => {
    await saveCallSummary(makeSummary({ summary: "first" }));
    const after = await saveCallSummary(makeSummary({ summary: "second" }));
    expect(after).toHaveLength(1);
    expect(after[0].summary).toBe("second");
  });

  it("returns distinct conversations newest-first", async () => {
    await saveCallSummary(
      makeSummary({ conversationId: "old", receivedAt: "2026-05-31T10:00:00.000Z" })
    );
    await saveCallSummary(
      makeSummary({ conversationId: "new", receivedAt: "2026-05-31T11:00:00.000Z" })
    );
    const list = await readCallSummaries();
    expect(list.map((s) => s.conversationId)).toEqual(["new", "old"]);
  });
});
