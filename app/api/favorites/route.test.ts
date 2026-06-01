import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the store so the route test never touches the filesystem.
const addFavorite = vi.fn(async (fav: { id: string; name: string }) => [
  { ...fav, savedAt: "now" },
]);
vi.mock("@/lib/favorites", () => ({
  addFavorite: (fav: { id: string; name: string }) => addFavorite(fav),
}));

import { POST } from "./route";

const post = (body: unknown, auth?: string) =>
  new NextRequest("http://localhost/api/favorites", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });

describe("POST /api/favorites", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOOL_SHARED_SECRET = "s3cret";
    addFavorite.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("401s without a Bearer token", async () => {
    const res = await POST(post({ id: "1", name: "A" }));
    expect(res.status).toBe(401);
    expect(addFavorite).not.toHaveBeenCalled();
  });

  it("401s with the wrong secret", async () => {
    const res = await POST(post({ id: "1", name: "A" }, "Bearer nope"));
    expect(res.status).toBe(401);
    expect(addFavorite).not.toHaveBeenCalled();
  });

  it("400s on a missing field", async () => {
    const res = await POST(post({ id: "1" }, "Bearer s3cret"));
    expect(res.status).toBe(400);
    expect(addFavorite).not.toHaveBeenCalled();
  });

  it("200s and persists with the correct Bearer", async () => {
    const res = await POST(post({ id: "11007", name: "Margarita" }, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: true, count: 1 });
    expect(addFavorite).toHaveBeenCalledWith({ id: "11007", name: "Margarita" });
  });
});
