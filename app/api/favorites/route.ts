import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { addFavorite } from "@/lib/favorites";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/favorites");

export const dynamic = "force-dynamic";

/** Constant-time compare that won't throw on length mismatch. */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Extract the `Bearer <token>` value from the Authorization header. */
function bearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * POST /api/favorites   { name, id }
 * Server tool `save_favorite`. Requires `Authorization: Bearer <TOOL_SHARED_SECRET>`
 * (the secret is configured on the tool as a constant header value). Persists to a
 * local JSON store.
 */
export async function POST(req: NextRequest) {
  log.info("save favorite requested");

  const expected = process.env.TOOL_SHARED_SECRET ?? "";
  const provided = bearer(req);
  if (!expected || !provided || !secretsMatch(provided, expected)) {
    log.warn("save favorite unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; id?: unknown };
  try {
    body = (await req.json()) as { name?: unknown; id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!name || !id) {
    return NextResponse.json(
      { error: "Body must include string `name` and `id`" },
      { status: 400 }
    );
  }

  try {
    const favorites = await addFavorite({ id, name });
    log.info("favorite saved", { count: favorites.length });
    return NextResponse.json({ saved: true, count: favorites.length });
  } catch (error) {
    log.error("save favorite failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to save favorite" }, { status: 500 });
  }
}
