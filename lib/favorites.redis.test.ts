import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Exercises the Redis backend of the favorites store by mocking the kv client.
 * (The file backend is covered in favorites.test.ts.) A tiny in-memory fake
 * stands in for Upstash so we assert the read-modify-write path without a network.
 */

const store = new Map<string, unknown>();
const fakeRedis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
    return "OK";
  }),
};

vi.mock("@/lib/kv", () => ({
  KV_PREFIX: "last-call",
  isRedisConfigured: () => true,
  getRedis: () => fakeRedis,
}));

import { addFavorite, readFavorites } from "./favorites";

describe("favorites store (Redis backend)", () => {
  beforeEach(() => {
    store.clear();
    fakeRedis.get.mockClear();
    fakeRedis.set.mockClear();
  });

  it("returns [] when nothing is stored yet", async () => {
    expect(await readFavorites()).toEqual([]);
    expect(fakeRedis.get).toHaveBeenCalledWith("last-call:favorites");
  });

  it("writes to Redis (not the filesystem) and round-trips", async () => {
    const after = await addFavorite({ id: "11007", name: "Margarita" });
    expect(after).toHaveLength(1);
    expect(fakeRedis.set).toHaveBeenCalledWith("last-call:favorites", after);

    const reread = await readFavorites();
    expect(reread).toHaveLength(1);
    expect(reread[0]).toMatchObject({ id: "11007", name: "Margarita" });
    expect(reread[0].savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("appends across multiple writes", async () => {
    await addFavorite({ id: "1", name: "A" });
    const after = await addFavorite({ id: "2", name: "B" });
    expect(after.map((f) => f.id)).toEqual(["1", "2"]);
  });
});
