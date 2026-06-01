import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { proxy } from "./proxy";

/** Minimal request carrying just the Authorization header the middleware reads. */
function req(authorization?: string) {
  const h = new Headers();
  if (authorization) h.set("authorization", authorization);
  return { headers: h } as unknown as Parameters<typeof proxy>[0];
}

const basic = (user: string, pass: string) =>
  "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

describe("analytics Basic Auth middleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUMMARY_USER = "barkeep";
    process.env.SUMMARY_PASSWORD = "s3cret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("passes through with correct credentials", () => {
    const res = proxy(req(basic("barkeep", "s3cret")));
    expect(res.status).toBe(200);
  });

  it("challenges (401) with no credentials", () => {
    const res = proxy(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Basic/);
  });

  it("rejects (401) a wrong password", () => {
    expect(proxy(req(basic("barkeep", "nope"))).status).toBe(401);
  });

  it("rejects (401) a wrong user", () => {
    expect(proxy(req(basic("intruder", "s3cret"))).status).toBe(401);
  });

  it("rejects (401) a malformed base64 payload", () => {
    expect(proxy(req("Basic !!!not-base64!!!")).status).toBe(401);
  });

  describe("when credentials are not configured", () => {
    beforeEach(() => {
      delete process.env.SUMMARY_USER;
      delete process.env.SUMMARY_PASSWORD;
    });

    it("allows in development", () => {
      // vitest sets NODE_ENV to "test"; the guard only blocks in production.
      const res = proxy(req());
      expect(res.status).toBe(200);
    });

    it("denies (503) in production so analytics is never accidentally public", () => {
      const prev = process.env.NODE_ENV;
      // NODE_ENV is read-only-typed; assign through a cast.
      (process.env as Record<string, string>).NODE_ENV = "production";
      try {
        expect(proxy(req()).status).toBe(503);
      } finally {
        (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
      }
    });
  });
});
