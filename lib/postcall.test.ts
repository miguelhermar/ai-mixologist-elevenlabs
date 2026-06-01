import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  verifyPostCallSignature,
  parsePostCallEvent,
  toCallSummary,
  DEFAULT_TOLERANCE_MS,
  TRANSCRIPTION_EVENT_TYPE,
} from "./postcall";

const SECRET = "whsec_test_secret";

/** Build a valid `t=…,v0=…` signature header for a body at a given time. */
function sign(rawBody: string, secret = SECRET, atMs = Date.now()): string {
  const t = Math.floor(atMs / 1000);
  const hash = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v0=${hash}`;
}

const sampleEvent = {
  type: TRANSCRIPTION_EVENT_TYPE,
  event_timestamp: 1_716_000_000,
  data: {
    agent_id: "agent_123",
    conversation_id: "conv_abc",
    status: "done",
    metadata: { call_duration_secs: 95 },
    analysis: {
      transcript_summary: "Guest wanted something sour; got a Margarita and made it.",
      call_successful: "success",
      evaluation_criteria_results: {
        complete_recipe: {
          criteria_id: "complete_recipe",
          result: "success",
          rationale: "Full recipe with measures was given.",
        },
      },
      data_collection_results: {
        favorite_cocktail: { data_collection_id: "favorite_cocktail", value: "Margarita", rationale: "Chose it." },
        made_a_drink: { data_collection_id: "made_a_drink", value: true, rationale: "Ran a shake timer." },
      },
    },
  },
};

describe("verifyPostCallSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify(sampleEvent);
    const header = sign(body);
    expect(verifyPostCallSignature({ rawBody: body, signatureHeader: header, secret: SECRET })).toEqual({
      valid: true,
    });
  });

  it("rejects when the secret is not configured", () => {
    const body = "{}";
    expect(
      verifyPostCallSignature({ rawBody: body, signatureHeader: sign(body), secret: undefined })
    ).toEqual({ valid: false, reason: "missing_secret" });
  });

  it("rejects a missing signature header", () => {
    expect(
      verifyPostCallSignature({ rawBody: "{}", signatureHeader: null, secret: SECRET })
    ).toEqual({ valid: false, reason: "missing_header" });
  });

  it("rejects a malformed header (no t= / v0=)", () => {
    expect(
      verifyPostCallSignature({ rawBody: "{}", signatureHeader: "garbage", secret: SECRET })
    ).toEqual({ valid: false, reason: "bad_format" });
  });

  it("rejects a wrong secret (hash mismatch)", () => {
    const body = JSON.stringify(sampleEvent);
    const header = sign(body, "the_wrong_secret");
    expect(
      verifyPostCallSignature({ rawBody: body, signatureHeader: header, secret: SECRET })
    ).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const body = JSON.stringify(sampleEvent);
    const header = sign(body);
    const tampered = body.replace("Margarita", "Negroni");
    expect(
      verifyPostCallSignature({ rawBody: tampered, signatureHeader: header, secret: SECRET })
    ).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const body = JSON.stringify(sampleEvent);
    const old = Date.now() - (DEFAULT_TOLERANCE_MS + 60_000);
    const header = sign(body, SECRET, old);
    expect(
      verifyPostCallSignature({ rawBody: body, signatureHeader: header, secret: SECRET })
    ).toEqual({ valid: false, reason: "expired" });
  });

  it("accepts an old timestamp when a custom now() keeps it in-window", () => {
    const signedAt = 1_716_000_000_000; // fixed ms
    const body = JSON.stringify(sampleEvent);
    const header = sign(body, SECRET, signedAt);
    expect(
      verifyPostCallSignature({
        rawBody: body,
        signatureHeader: header,
        secret: SECRET,
        now: () => signedAt + 1000,
      })
    ).toEqual({ valid: true });
  });
});

describe("parsePostCallEvent", () => {
  it("parses valid JSON into an event", () => {
    const event = parsePostCallEvent(JSON.stringify(sampleEvent));
    expect(event?.type).toBe(TRANSCRIPTION_EVENT_TYPE);
    expect(event?.data?.conversation_id).toBe("conv_abc");
  });

  it("returns null for invalid JSON", () => {
    expect(parsePostCallEvent("{not json")).toBeNull();
  });
});

describe("toCallSummary", () => {
  it("reshapes a transcription event into the slim record", () => {
    const summary = toCallSummary(sampleEvent, "2026-05-31T12:00:00.000Z");
    expect(summary).toMatchObject({
      conversationId: "conv_abc",
      agentId: "agent_123",
      receivedAt: "2026-05-31T12:00:00.000Z",
      eventTimestamp: 1_716_000_000,
      durationSecs: 95,
      callSuccessful: "success",
      summary: expect.stringContaining("Margarita"),
    });
    expect(summary?.dataCollection.favorite_cocktail).toEqual({
      value: "Margarita",
      rationale: "Chose it.",
    });
    expect(summary?.dataCollection.made_a_drink.value).toBe(true);
    expect(summary?.evaluations.complete_recipe).toEqual({
      result: "success",
      rationale: "Full recipe with measures was given.",
    });
  });

  it("returns null when there is no conversation id", () => {
    expect(toCallSummary({ type: TRANSCRIPTION_EVENT_TYPE, data: {} })).toBeNull();
  });

  it("tolerates a missing analysis block", () => {
    const summary = toCallSummary({
      type: TRANSCRIPTION_EVENT_TYPE,
      data: { conversation_id: "conv_x" },
    });
    expect(summary).toMatchObject({
      conversationId: "conv_x",
      summary: null,
      callSuccessful: null,
      dataCollection: {},
      evaluations: {},
    });
  });
});
