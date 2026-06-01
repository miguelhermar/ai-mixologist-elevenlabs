import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const req = (qs: string) =>
  new NextRequest(`http://localhost/api/cocktails/by-ingredient${qs}`);

describe("GET /api/cocktails/by-ingredient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("400s when `ingredient` is missing", async () => {
    expect((await GET(req(""))).status).toBe(400);
  });

  it("returns slim summaries", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        drinks: [{ idDrink: "1", strDrink: "Gin Fizz", strDrinkThumb: "t.jpg" }],
      }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET(req("?ingredient=Gin"));
    expect(res.status).toBe(200);
    expect((await res.json()).cocktails).toEqual([
      { id: "1", name: "Gin Fizz", thumb: "t.jpg" },
    ]);
  });

  it("returns [] for an unknown ingredient (drinks:null)", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ drinks: null }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET(req("?ingredient=Unobtanium"));
    expect(res.status).toBe(200);
    expect((await res.json()).cocktails).toEqual([]);
  });
});
