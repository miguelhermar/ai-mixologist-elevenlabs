/**
 * Same-origin guard for the public `/api/signed-url` route.
 *
 * Pairs with the rate limiter: it stops other websites from calling our
 * credit-spending endpoint from a browser. If a request carries an `Origin` or
 * `Referer` header (browsers send `Origin` on cross-origin fetches), we require
 * its host to match our own deployment. Requests with no such header are allowed
 * — same-origin GETs may omit `Origin`, and the rate limiter is the backstop for
 * non-browser callers.
 *
 * The set of allowed hosts is derived from `PUBLIC_BASE_URL` and the incoming
 * request's own host, so it works on any domain (`*.vercel.app`, a custom
 * domain, or `localhost`) without per-environment config.
 */

import { createLogger } from "@/lib/logger";

const log = createLogger("origin-guard");

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    // `Referer` is a full URL; `Origin` is scheme+host. URL parses both.
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosts we accept as "us": the request's own host + PUBLIC_BASE_URL's host. */
export function allowedHosts(requestHeaders: Headers): Set<string> {
  const hosts = new Set<string>();
  const selfHost = requestHeaders.get("host")?.toLowerCase();
  if (selfHost) hosts.add(selfHost);
  const configured = hostOf(process.env.PUBLIC_BASE_URL);
  if (configured) hosts.add(configured);
  return hosts;
}

/**
 * Returns true when the request may proceed. Rejects only when a present
 * Origin/Referer host is NOT one of our own hosts.
 */
export function isAllowedOrigin(requestHeaders: Headers): boolean {
  const claimed = hostOf(requestHeaders.get("origin")) ?? hostOf(requestHeaders.get("referer"));
  if (!claimed) return true; // no cross-origin signal → allow (rate limit backstops)

  const allowed = allowedHosts(requestHeaders);
  if (allowed.has(claimed)) return true;

  log.warn("blocked foreign origin", { claimed, allowed: [...allowed] });
  return false;
}
