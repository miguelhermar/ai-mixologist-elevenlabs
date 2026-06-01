/**
 * Server-side helper for minting ElevenLabs Agents signed URLs.
 *
 * The signed URL lets the browser open a private WebSocket conversation with an
 * agent without ever exposing `XI_API_KEY` to the client. Only this module
 * (running on the Next.js server) ever sees the key.
 *
 * Docs: GET /v1/convai/conversation/get-signed-url?agent_id=...  (header: xi-api-key)
 */

import { createLogger, redact } from "@/lib/logger";

const log = createLogger("signed-url");

export const ELEVENLABS_API_BASE =
  process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io";

/** Error carrying an HTTP status so the API route can mirror it to the client. */
export class SignedUrlError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SignedUrlError";
    this.status = status;
  }
}

export interface GetSignedUrlOptions {
  apiKey: string;
  agentId: string;
  /** Override for tests / non-default regions. */
  apiBase?: string;
  /** Injectable fetch implementation (defaults to global fetch); eases testing. */
  fetchImpl?: typeof fetch;
}

/**
 * Requests a single-use signed WebSocket URL for the given agent.
 * Throws {@link SignedUrlError} on misconfiguration or upstream failure.
 */
export async function getSignedUrl({
  apiKey,
  agentId,
  apiBase = ELEVENLABS_API_BASE,
  fetchImpl = fetch,
}: GetSignedUrlOptions): Promise<string> {
  if (!apiKey) {
    throw new SignedUrlError("Missing XI_API_KEY environment variable", 500);
  }
  if (!agentId) {
    throw new SignedUrlError("Missing AGENT_ID environment variable", 500);
  }

  const url = `${apiBase}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(
    agentId
  )}`;

  log.debug("calling get-signed-url", { agentId });
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.debug("get-signed-url upstream error", { status: res.status });
    throw new SignedUrlError(
      `ElevenLabs get-signed-url failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status
    );
  }

  const data = (await res.json()) as { signed_url?: string };
  if (!data.signed_url) {
    throw new SignedUrlError("ElevenLabs response did not include signed_url", 502);
  }

  log.debug("get-signed-url ok", { signedUrl: redact(data.signed_url) });
  return data.signed_url;
}
