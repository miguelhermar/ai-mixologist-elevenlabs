import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLogger, redact } from "./logger";

describe("createLogger", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("prefixes messages with the scope", () => {
    createLogger("widget").info("connect requested");
    expect(console.info).toHaveBeenCalledWith("[last-call:widget] connect requested");
  });

  it("passes meta through as a second argument", () => {
    createLogger("api").error("boom", { status: 500 });
    expect(console.error).toHaveBeenCalledWith("[last-call:api] boom", {
      status: 500,
    });
  });

  it("routes each level to the matching console method", () => {
    const log = createLogger("x");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(console.info).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("suppresses debug by default (not in development)", () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.NEXT_PUBLIC_LOG_DEBUG;
    delete process.env.LOG_DEBUG;
    createLogger("x").debug("quiet");
    expect(console.debug).not.toHaveBeenCalled();
  });

  it("emits debug when LOG_DEBUG is enabled", () => {
    process.env.LOG_DEBUG = "1";
    createLogger("x").debug("loud");
    expect(console.debug).toHaveBeenCalledWith("[last-call:x] loud");
  });

  it("emits debug in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.NEXT_PUBLIC_LOG_DEBUG;
    delete process.env.LOG_DEBUG;
    createLogger("x").debug("dev");
    expect(console.debug).toHaveBeenCalled();
  });
});

describe("redact", () => {
  it("returns <none> for empty values", () => {
    expect(redact("")).toBe("<none>");
    expect(redact(undefined)).toBe("<none>");
    expect(redact(null)).toBe("<none>");
  });

  it("fully redacts short values", () => {
    expect(redact("short", 24)).toBe("<redacted>");
  });

  it("keeps a head and hides the rest for long values", () => {
    const out = redact("wss://api.elevenlabs.io/v1/convai/conversation?token=secret", 24);
    expect(out.startsWith("wss://api.elevenlabs.io")).toBe(true);
    expect(out).toContain("redacted");
    expect(out).not.toContain("token=secret");
  });
});
