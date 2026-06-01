import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";

// Mock the persistence layer so the route test never touches disk; capture what
// the route tried to persist so we can assert on the reshaped summary.
let lastSaved: { conversationId?: string; summary?: string } | undefined;
const saveMock = vi.fn(async (summary: { conversationId?: string; summary?: string }) => {
  lastSaved = summary;
  return [{ conversationId: "conv_abc" }];
});
vi.mock("@/lib/callSummaries", () => ({
  saveCallSummary: (summary: { conversationId?: string }) => saveMock(summary),
}));

import { POST } from "./route";

const SECRET = "whsec_route_secret";

function sign(rawBody: string, secret = SECRET, atMs = Date.now()): string {
  const t = Math.floor(atMs / 1000);
  const hash = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v0=${hash}`;
}

function postReq(rawBody: string, header: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (header) headers.set("ElevenLabs-Signature", header);
  return new Request("http://localhost/api/post-call", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

const transcriptionEvent = JSON.stringify({
  type: "post_call_transcription",
  event_timestamp: 1_716_000_000,
  data: {
    agent_id: "agent_123",
    conversation_id: "conv_abc",
    analysis: {
      transcript_summary: "Made a Margarita.",
      call_successful: "success",
      data_collection_results: {
        favorite_cocktail: { value: "Margarita", rationale: "chose it" },
      },
      evaluation_criteria_results: {
        complete_recipe: { result: "success", rationale: "ok" },
      },
    },
  },
});

describe("POST /api/post-call", () => {
  beforeEach(() => {
    process.env.POSTCALL_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveMock.mockClear();
    lastSaved = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.POSTCALL_WEBHOOK_SECRET;
  });

  it("401s when the signature header is missing", async () => {
    const res = await POST(postReq(transcriptionEvent, null) as never);
    expect(res.status).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("401s on a bad signature", async () => {
    const res = await POST(postReq(transcriptionEvent, sign(transcriptionEvent, "wrong")) as never);
    expect(res.status).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("401s when the body was tampered after signing", async () => {
    const header = sign(transcriptionEvent);
    const tampered = transcriptionEvent.replace("Margarita", "Negroni");
    const res = await POST(postReq(tampered, header) as never);
    expect(res.status).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("200s and persists a valid transcription event", async () => {
    const res = await POST(postReq(transcriptionEvent, sign(transcriptionEvent)) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, conversationId: "conv_abc" });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(lastSaved?.conversationId).toBe("conv_abc");
    expect(lastSaved?.summary).toBe("Made a Margarita.");
  });

  it("200s but ignores a non-transcription event", async () => {
    const other = JSON.stringify({ type: "post_call_audio", data: {} });
    const res = await POST(postReq(other, sign(other)) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("400s on a signed-but-unparseable body", async () => {
    const bad = "{not json";
    const res = await POST(postReq(bad, sign(bad)) as never);
    expect(res.status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
