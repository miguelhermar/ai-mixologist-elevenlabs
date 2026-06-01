import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/cocktails/random", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns a random cocktail detail", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ drinks: [{ idDrink: "1", strDrink: "Negroni" }] }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).cocktail.name).toBe("Negroni");
  });

  it("502s on an upstream failure", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom",
    })) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to fetch a random cocktail");
  });
});
