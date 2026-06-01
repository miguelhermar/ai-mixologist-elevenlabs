import { describe, it, expect, afterEach } from "vitest";
import { checkRateLimit, clientIp } from "./ratelimit";

describe("ratelimit", () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  describe("checkRateLimit", () => {
    it("is a no-op (always allowed) when Upstash is not configured", async () => {
      const result = await checkRateLimit("1.2.3.4");
      expect(result.success).toBe(true);
    });
  });

  describe("clientIp", () => {
    it("uses the first hop of x-forwarded-for", () => {
      const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
      expect(clientIp(h)).toBe("203.0.113.7");
    });

    it("falls back to x-real-ip", () => {
      expect(clientIp(new Headers({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
    });

    it("returns 'unknown' when no IP header is present", () => {
      expect(clientIp(new Headers())).toBe("unknown");
    });
  });
});
