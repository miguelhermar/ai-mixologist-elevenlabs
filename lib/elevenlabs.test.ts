import { describe, it, expect, vi } from "vitest";
import { getSignedUrl, SignedUrlError } from "./elevenlabs";

/** Builds a minimal fetch stub returning the given response. */
function fetchReturning(
  init: { ok: boolean; status?: number; json?: unknown; text?: string }
): typeof fetch {
  return vi.fn(async () => ({
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => init.json,
    text: async () => init.text ?? "",
  })) as unknown as typeof fetch;
}

/** Reads the recorded calls off a vi.fn-backed fetch stub. */
function callsOf(fetchImpl: typeof fetch): [string, RequestInit][] {
  return (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } })
    .mock.calls;
}

describe("getSignedUrl", () => {
  const base = {
    apiKey: "sk_test",
    agentId: "agent_123",
    apiBase: "https://api.example.test",
  };

  it("returns the signed_url from a successful response", async () => {
    const fetchImpl = fetchReturning({
      ok: true,
      json: { signed_url: "wss://signed.example/abc" },
    });

    const url = await getSignedUrl({ ...base, fetchImpl });

    expect(url).toBe("wss://signed.example/abc");
  });

  it("calls the correct endpoint with the api key header", async () => {
    const fetchImpl = fetchReturning({
      ok: true,
      json: { signed_url: "wss://ok" },
    });

    await getSignedUrl({ ...base, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = callsOf(fetchImpl)[0];
    expect(calledUrl).toBe(
      "https://api.example.test/v1/convai/conversation/get-signed-url?agent_id=agent_123"
    );
    expect((calledInit as RequestInit).headers).toMatchObject({
      "xi-api-key": "sk_test",
    });
  });

  it("url-encodes the agent id", async () => {
    const fetchImpl = fetchReturning({ ok: true, json: { signed_url: "wss://ok" } });
    await getSignedUrl({ ...base, agentId: "agent/with space", fetchImpl });
    const [calledUrl] = callsOf(fetchImpl)[0];
    expect(calledUrl).toContain("agent_id=agent%2Fwith%20space");
  });

  it("throws a 500 SignedUrlError when the api key is missing", async () => {
    await expect(
      getSignedUrl({ ...base, apiKey: "", fetchImpl: fetchReturning({ ok: true }) })
    ).rejects.toMatchObject({ name: "SignedUrlError", status: 500 });
  });

  it("throws a 500 SignedUrlError when the agent id is missing", async () => {
    await expect(
      getSignedUrl({ ...base, agentId: "", fetchImpl: fetchReturning({ ok: true }) })
    ).rejects.toBeInstanceOf(SignedUrlError);
  });

  it("propagates the upstream status on a failed response", async () => {
    const fetchImpl = fetchReturning({ ok: false, status: 401, text: "unauthorized" });
    await expect(getSignedUrl({ ...base, fetchImpl })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws 502 when the response lacks signed_url", async () => {
    const fetchImpl = fetchReturning({ ok: true, json: {} });
    await expect(getSignedUrl({ ...base, fetchImpl })).rejects.toMatchObject({
      status: 502,
    });
  });
});
