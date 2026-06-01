import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const req = (qs: string) =>
  new NextRequest(`http://localhost/api/cocktails/search${qs}`);

describe("GET /api/cocktails/search", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("400s when `name` is missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  it("returns trimmed cocktails on success", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        drinks: [
          { idDrink: "1", strDrink: "Margarita", strIngredient1: "Tequila", strMeasure1: "2 oz" },
        ],
      }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET(req("?name=margarita"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cocktails[0]).toMatchObject({
      name: "Margarita",
      ingredients: [{ name: "Tequila", measure: "2 oz" }],
    });
  });

  it("maps an upstream failure to a generic error", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => "down",
    })) as unknown as typeof fetch;

    const res = await GET(req("?name=x"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to search cocktails" });
  });
});
