import { describe, it, expect, afterEach } from "vitest";
import { isRedisConfigured, getRedis, KV_PREFIX } from "./kv";

describe("kv (Upstash client factory)", () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("reports not-configured and returns null when env vars are absent", () => {
    expect(isRedisConfigured()).toBe(false);
    expect(getRedis()).toBeNull();
  });

  it("reports configured when both Upstash env vars are present", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    expect(isRedisConfigured()).toBe(true);
  });

  it("requires BOTH env vars to be considered configured", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    expect(isRedisConfigured()).toBe(false);
  });

  it("exposes a stable key prefix", () => {
    expect(KV_PREFIX).toBe("last-call");
  });
});
