import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const req = (qs: string) =>
  new NextRequest(`http://localhost/api/cocktails/by-mood${qs}`);

describe("GET /api/cocktails/by-mood", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("400s with knownMoods when `mood` is missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect((await res.json()).knownMoods).toContain("sour");
  });

  it("400s for an unknown mood", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const res = await GET(req("?mood=hangry"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown mood");
  });

  it("returns suggestions echoing mood + abv_mode", async () => {
    global.fetch = vi.fn(async (url: string) => {
      const drinks = url.includes("filter.php?a=Alcoholic")
        ? [{ idDrink: "1", strDrink: "Sour One", strDrinkThumb: null }]
        : [{ idDrink: "1", strDrink: "Sour One", strDrinkThumb: null }];
      return { ok: true, status: 200, json: async () => ({ drinks }), text: async () => "" };
    }) as unknown as typeof fetch;

    const res = await GET(req("?mood=sour&abv_mode=low-abv"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mood).toBe("sour");
    expect(body.abv_mode).toBe("low-abv");
    expect(body.cocktails[0].name).toBe("Sour One");
  });
});
