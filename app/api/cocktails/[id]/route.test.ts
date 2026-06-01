import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const bareReq = new Request("http://localhost/api/cocktails/1");

describe("GET /api/cocktails/[id]", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the trimmed detail on success", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        drinks: [{ idDrink: "11007", strDrink: "Margarita", strGlass: "Cocktail glass" }],
      }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET(bareReq, ctx("11007"));
    expect(res.status).toBe(200);
    expect((await res.json()).cocktail).toMatchObject({ id: "11007", name: "Margarita" });
  });

  it("404s when the id is unknown", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ drinks: null }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET(bareReq, ctx("000"));
    expect(res.status).toBe(404);
  });
});
