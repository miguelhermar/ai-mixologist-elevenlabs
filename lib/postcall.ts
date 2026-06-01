/**
 * Post-call webhook helpers (Phase 5).
 *
 * ElevenLabs' cloud POSTs a signed JSON payload to our `/api/post-call` route at
 * the end of every conversation. This module owns two concerns, both pure and
 * injectable so they unit-test without a running server:
 *
 *   1. `verifyPostCallSignature` — validate the HMAC signature so we only trust
 *      payloads that actually came from ElevenLabs.
 *   2. `parsePostCallEvent` / `toCallSummary` — parse the raw body and reshape the
 *      verbose payload down to the slim analytics record we persist + render.
 *
 * The signature scheme is mirrored exactly from the ElevenLabs JS SDK's
 * `webhooks.constructEvent` (we reimplement it here rather than instantiate the
 * full SDK client, matching this project's injectable-helper pattern):
 *   - Header `ElevenLabs-Signature` looks like `t=<unix_seconds>,v0=<hex>`.
 *   - The signed message is `` `${timestamp}.${rawBody}` ``.
 *   - The hash is HMAC-SHA256, hex-encoded, prefixed with `v0=`.
 *   - The timestamp must be within a tolerance window (default 30 minutes) to
 *     blunt replay attacks.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Default replay-tolerance window: matches the SDK (30 minutes). */
export const DEFAULT_TOLERANCE_MS = 30 * 60 * 1000;

export interface VerifyOptions {
  /** The exact raw request body string (NOT a re-serialized JSON object). */
  rawBody: string;
  /** The `ElevenLabs-Signature` header value, or null if absent. */
  signatureHeader: string | null | undefined;
  /** The webhook's shared HMAC secret (`POSTCALL_WEBHOOK_SECRET`). */
  secret: string | undefined;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  now?: () => number;
  /** Replay-tolerance window in ms. */
  toleranceMs?: number;
}

/** Why a signature was rejected — logged server-side, never returned to the caller. */
export type VerifyFailureReason =
  | "missing_secret"
  | "missing_header"
  | "bad_format"
  | "expired"
  | "mismatch";

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: VerifyFailureReason };

/** Constant-time string compare that won't throw on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify an ElevenLabs post-call webhook signature. Returns a structured result
 * so the route can log *why* it failed while still returning a generic 401.
 */
export function verifyPostCallSignature(opts: VerifyOptions): VerifyResult {
  const { rawBody, signatureHeader, secret } = opts;
  const now = opts.now ?? (() => Date.now());
  const toleranceMs = opts.toleranceMs ?? DEFAULT_TOLERANCE_MS;

  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  // Header is a comma-separated list of `k=v` parts, e.g. `t=1700000000,v0=abc…`.
  const parts = signatureHeader.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const provided = parts.find((p) => p.startsWith("v0="));
  if (!timestamp || !provided) return { valid: false, reason: "bad_format" };

  // Reject stale (or future-dated) timestamps to limit replay.
  const sentAtMs = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAtMs)) return { valid: false, reason: "bad_format" };
  if (Math.abs(now() - sentAtMs) > toleranceMs) {
    return { valid: false, reason: "expired" };
  }

  const expected =
    "v0=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!safeEqual(provided, expected)) return { valid: false, reason: "mismatch" };

  return { valid: true };
}

// --- Payload shapes (the subset of the inbound webhook we care about) ---------

/** One evaluation criterion's outcome (LLM-judged against the transcript). */
export interface EvaluationCriteriaResult {
  criteria_id?: string;
  /** "success" | "failure" | "unknown" */
  result?: string;
  rationale?: string;
}

/** One data-collection item the analysis LLM extracted from the conversation. */
export interface DataCollectionResult {
  data_collection_id?: string;
  value?: unknown;
  rationale?: string;
}

export interface PostCallAnalysis {
  transcript_summary?: string;
  /** "success" | "failure" | "unknown" */
  call_successful?: string;
  evaluation_criteria_results?: Record<string, EvaluationCriteriaResult> | null;
  data_collection_results?: Record<string, DataCollectionResult> | null;
}

export interface PostCallMetadata {
  start_time_unix_secs?: number;
  call_duration_secs?: number;
}

export interface PostCallData {
  agent_id?: string;
  conversation_id?: string;
  status?: string;
  metadata?: PostCallMetadata;
  analysis?: PostCallAnalysis;
}

export interface PostCallEvent {
  /** e.g. "post_call_transcription" (we ignore other event types). */
  type?: string;
  event_timestamp?: number;
  data?: PostCallData;
}

/** Event type we persist analytics for. Other types are acknowledged + ignored. */
export const TRANSCRIPTION_EVENT_TYPE = "post_call_transcription";

/** Parse the raw body into a typed event, or null if it isn't valid JSON. */
export function parsePostCallEvent(rawBody: string): PostCallEvent | null {
  try {
    return JSON.parse(rawBody) as PostCallEvent;
  } catch {
    return null;
  }
}

/** The slim analytics record we persist per call + render on the summary page. */
export interface CallSummary {
  conversationId: string;
  agentId: string | null;
  /** ISO timestamp set when we processed the webhook. */
  receivedAt: string;
  /** Unix seconds from the payload, if present. */
  eventTimestamp: number | null;
  durationSecs: number | null;
  /** "success" | "failure" | "unknown" | null */
  callSuccessful: string | null;
  summary: string | null;
  /** id -> { value, rationale } for each configured data-collection item. */
  dataCollection: Record<string, { value: unknown; rationale: string | null }>;
  /** id -> { result, rationale } for each configured evaluation criterion. */
  evaluations: Record<string, { result: string | null; rationale: string | null }>;
}

/**
 * Reshape a verified transcription event into the slim record we store. Returns
 * null when the event lacks the bits that make it a real call summary (no
 * conversation id) so the route can no-op gracefully.
 */
export function toCallSummary(
  event: PostCallEvent,
  receivedAtIso = new Date().toISOString()
): CallSummary | null {
  const data = event.data;
  if (!data?.conversation_id) return null;

  const analysis = data.analysis ?? {};

  const dataCollection: CallSummary["dataCollection"] = {};
  for (const [key, item] of Object.entries(analysis.data_collection_results ?? {})) {
    dataCollection[key] = {
      value: item?.value ?? null,
      rationale: item?.rationale ?? null,
    };
  }

  const evaluations: CallSummary["evaluations"] = {};
  for (const [key, item] of Object.entries(analysis.evaluation_criteria_results ?? {})) {
    evaluations[key] = {
      result: item?.result ?? null,
      rationale: item?.rationale ?? null,
    };
  }

  return {
    conversationId: data.conversation_id,
    agentId: data.agent_id ?? null,
    receivedAt: receivedAtIso,
    eventTimestamp: typeof event.event_timestamp === "number" ? event.event_timestamp : null,
    durationSecs:
      typeof data.metadata?.call_duration_secs === "number"
        ? data.metadata.call_duration_secs
        : null,
    callSuccessful: analysis.call_successful ?? null,
    summary: analysis.transcript_summary ?? null,
    dataCollection,
    evaluations,
  };
}
