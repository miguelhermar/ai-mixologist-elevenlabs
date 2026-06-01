/**
 * Proxy (formerly "middleware") — HTTP Basic Auth for the analytics surface.
 *
 * The `/summary` page and its `/api/summaries` data source expose every guest's
 * call recap and extracted preferences (favorite drink, taste profile). That's
 * fine for the operator, but must not be public. This gates both behind Basic
 * Auth against `SUMMARY_USER` / `SUMMARY_PASSWORD`.
 *
 * If the credentials are not configured: allow in development (so local work is
 * frictionless) but DENY in production, so the analytics can never be exposed by
 * a forgotten env var.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy` (it runs on the
 * Node.js runtime). The constant-time compare is plain JS so it stays
 * runtime-agnostic.
 */

import { NextRequest, NextResponse } from "next/server";

/** Length-independent constant-time string compare (avoids early-exit timing leak). */
function safeEqual(a: string, b: string): boolean {
  // Compare against a fixed length so timing doesn't reveal which input differs.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Last Call analytics", charset="UTF-8"' },
  });
}

export function proxy(req: NextRequest): NextResponse {
  const user = process.env.SUMMARY_USER;
  const password = process.env.SUMMARY_PASSWORD;

  // Not configured: frictionless locally, but never open in production.
  if (!user || !password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Analytics auth is not configured.", { status: 503 });
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") ?? "";
  const match = /^Basic\s+(.+)$/i.exec(header.trim());
  if (match) {
    let decoded = "";
    try {
      decoded = atob(match[1]);
    } catch {
      decoded = "";
    }
    const sep = decoded.indexOf(":");
    const givenUser = sep >= 0 ? decoded.slice(0, sep) : "";
    const givenPass = sep >= 0 ? decoded.slice(sep + 1) : "";
    // Evaluate both compares (no short-circuit) to keep timing uniform.
    const ok = safeEqual(givenUser, user) && safeEqual(givenPass, password);
    if (ok) return NextResponse.next();
  }

  return unauthorized();
}

export const config = {
  matcher: ["/summary", "/summary/:path*", "/api/summaries"],
};
