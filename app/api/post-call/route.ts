import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  parsePostCallEvent,
  toCallSummary,
  verifyPostCallSignature,
  TRANSCRIPTION_EVENT_TYPE,
} from "@/lib/postcall";
import { saveCallSummary } from "@/lib/callSummaries";

const log = createLogger("api/post-call");

export const dynamic = "force-dynamic";

/**
 * POST /api/post-call
 *
 * Post-call webhook sink. ElevenLabs' cloud POSTs a signed transcription payload
 * here at the end of each conversation. We:
 *   1. Verify the HMAC signature (`ElevenLabs-Signature`) against
 *      `POSTCALL_WEBHOOK_SECRET` — only then do we trust the body.
 *   2. Reshape the `post_call_transcription` analysis (summary + evaluation
 *      criteria + data collection) into a slim record and persist it.
 *   3. Return 200 quickly so ElevenLabs doesn't retry.
 *
 * Non-transcription events (or summaries we can't key) are acknowledged with 200
 * and ignored — they're not errors.
 */
export async function POST(req: NextRequest) {
  log.info("post-call webhook received");

  // The signature is computed over the EXACT raw body, so read text (not json()).
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("elevenlabs-signature");

  const verification = verifyPostCallSignature({
    rawBody,
    signatureHeader,
    secret: process.env.POSTCALL_WEBHOOK_SECRET,
  });
  if (!verification.valid) {
    // Generic 401 to the caller; the real reason stays in our logs.
    log.warn("post-call signature rejected", { reason: verification.reason });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  log.debug("post-call signature verified");

  const event = parsePostCallEvent(rawBody);
  if (!event) {
    log.warn("post-call body was not valid JSON");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (event.type !== TRANSCRIPTION_EVENT_TYPE) {
    log.info("post-call event ignored (non-transcription)", { type: event.type });
    return NextResponse.json({ received: true, ignored: true });
  }

  const summary = toCallSummary(event);
  if (!summary) {
    log.warn("post-call transcription had no conversation id — ignored");
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const all = await saveCallSummary(summary);
    log.info("post-call summary persisted", {
      conversationId: summary.conversationId,
      callSuccessful: summary.callSuccessful,
      total: all.length,
    });
    return NextResponse.json({ received: true, conversationId: summary.conversationId });
  } catch (error) {
    log.error(
      "post-call summary persist failed",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Failed to persist summary" }, { status: 500 });
  }
}
