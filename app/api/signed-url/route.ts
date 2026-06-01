import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl, SignedUrlError } from "@/lib/elevenlabs";
import { createLogger } from "@/lib/logger";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { isAllowedOrigin } from "@/lib/originGuard";

const log = createLogger("api/signed-url");

// This route mints a fresh, short-lived signed URL on every request, so it must
// never be cached or statically optimized.
export const dynamic = "force-dynamic";

/**
 * GET /api/signed-url
 * Returns `{ signedUrl }` for the configured agent. The ElevenLabs API key
 * stays server-side; the browser receives only the signed WebSocket URL.
 *
 * Because this endpoint spends ElevenLabs quota and has no login, it is guarded
 * by a same-origin check + a per-IP rate limit before any session is minted.
 */
export async function GET(req: NextRequest) {
  log.info("signed-url requested");

  // 1. Same-origin guard: block other sites from spending our quota.
  if (!isAllowedOrigin(req.headers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Per-IP rate limit (no-op when Upstash isn't configured, e.g. local dev).
  const ip = clientIp(req.headers);
  const { success } = await checkRateLimit(ip);
  if (!success) {
    log.warn("signed-url rate limited", { ip });
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      { status: 429 }
    );
  }

  try {
    const signedUrl = await getSignedUrl({
      apiKey: process.env.XI_API_KEY ?? "",
      agentId: process.env.AGENT_ID ?? "",
    });
    log.info("signed-url issued");
    return NextResponse.json({ signedUrl });
  } catch (error) {
    const status = error instanceof SignedUrlError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    // Log the real cause server-side; return a generic message to the client.
    log.error(`signed-url failed (${status})`, message);
    return NextResponse.json(
      { error: "Failed to create signed URL" },
      { status }
    );
  }
}
