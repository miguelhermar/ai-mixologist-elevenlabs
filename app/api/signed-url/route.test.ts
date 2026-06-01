import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Integration test for the /api/signed-url route handler. We stub global fetch
 * (so no real ElevenLabs call happens) and drive the handler the way Next.js
 * would, asserting on the JSON Response it returns.
 *
 * The route is guarded by a same-origin check + a per-IP rate limit. The rate
 * limiter is mocked here so the success/error paths are deterministic; the
 * limiter's own logic is tested in lib/ratelimit.test.ts.
 */

// Mock the rate limiter: allow by default, overridable per test.
const checkRateLimit =
  vi.fn<(id: string) => Promise<{ success: boolean }>>(async () => ({ success: true }));
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (id: string) => checkRateLimit(id),
  clientIp: () => "1.2.3.4",
}));

import { GET } from "./route";

/** Build a minimal request with the given headers (defaults to same-origin). */
function makeReq(headers: Record<string, string> = {}) {
  const h = new Headers({ host: "bar.example", ...headers });
  return { headers: h } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/signed-url", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.XI_API_KEY = "sk_test";
    process.env.AGENT_ID = "agent_123";
    checkRateLimit.mockResolvedValue({ success: true });
    // Keep workflow logs out of test output (and let us assert error logging).
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    checkRateLimit.mockReset();
  });

  it("returns 200 with the signed URL on success", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ signed_url: "wss://signed.example/xyz" }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      signedUrl: "wss://signed.example/xyz",
    });
  });

  it("returns 500 with a generic error when env is missing", async () => {
    delete process.env.XI_API_KEY;
    global.fetch = vi.fn() as unknown as typeof fetch;

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to create signed URL",
    });
    // Should fail fast on config — never hits the network.
    expect(global.fetch).not.toHaveBeenCalled();
    // The failure is logged server-side for developer visibility.
    expect(console.error).toHaveBeenCalled();
  });

  it("mirrors the upstream status (e.g. 401) without leaking details", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "unauthorized",
    })) as unknown as typeof fetch;

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to create signed URL" });
    // The raw upstream message must not be exposed to the client.
    expect(JSON.stringify(body)).not.toContain("unauthorized");
  });

  it("returns 403 for a request from a foreign origin (no quota spent)", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;

    const res = await GET(makeReq({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    // Blocked before any session is minted.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("allows a same-origin request (Origin host matches our host)", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ signed_url: "wss://ok" }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const res = await GET(makeReq({ origin: "https://bar.example" }));
    expect(res.status).toBe(200);
  });

  it("returns 429 when the rate limit is exceeded (no quota spent)", async () => {
    checkRateLimit.mockResolvedValue({ success: false });
    global.fetch = vi.fn() as unknown as typeof fetch;

    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
