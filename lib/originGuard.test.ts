import { describe, it, expect, afterEach, vi } from "vitest";
import { isAllowedOrigin, allowedHosts } from "./originGuard";

function headers(map: Record<string, string>): Headers {
  return new Headers(map);
}

describe("originGuard", () => {
  afterEach(() => {
    delete process.env.PUBLIC_BASE_URL;
    vi.restoreAllMocks();
  });

  it("allows a request with no Origin/Referer (rate limit is the backstop)", () => {
    expect(isAllowedOrigin(headers({ host: "bar.example" }))).toBe(true);
  });

  it("allows when the Origin host matches the request host", () => {
    expect(
      isAllowedOrigin(headers({ host: "bar.example", origin: "https://bar.example" }))
    ).toBe(true);
  });

  it("allows when only the Referer matches (full URL form)", () => {
    expect(
      isAllowedOrigin(
        headers({ host: "bar.example", referer: "https://bar.example/some/path" })
      )
    ).toBe(true);
  });

  it("blocks a foreign Origin", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAllowedOrigin(headers({ host: "bar.example", origin: "https://evil.example" }))
    ).toBe(false);
  });

  it("also accepts the host configured via PUBLIC_BASE_URL", () => {
    process.env.PUBLIC_BASE_URL = "https://last-call.vercel.app";
    expect(
      isAllowedOrigin(
        headers({ host: "internal", origin: "https://last-call.vercel.app" })
      )
    ).toBe(true);
  });

  it("treats a malformed Origin as no signal (allowed)", () => {
    expect(
      isAllowedOrigin(headers({ host: "bar.example", origin: "not-a-url" }))
    ).toBe(true);
  });

  it("allowedHosts includes both the request host and PUBLIC_BASE_URL host", () => {
    process.env.PUBLIC_BASE_URL = "https://last-call.vercel.app";
    const hosts = allowedHosts(headers({ host: "bar.example" }));
    expect(hosts.has("bar.example")).toBe(true);
    expect(hosts.has("last-call.vercel.app")).toBe(true);
  });
});
