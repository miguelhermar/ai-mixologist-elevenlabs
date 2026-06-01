import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { readCallSummaries } from "@/lib/callSummaries";

const log = createLogger("api/summaries");

export const dynamic = "force-dynamic";

/**
 * GET /api/summaries
 *
 * Read-only list of persisted post-call summaries (newest first). Backs the
 * `/summary` page's data and is handy for curl-verifying that the post-call
 * webhook persisted a call during a live test.
 */
export async function GET() {
  try {
    const summaries = await readCallSummaries();
    log.debug("summaries listed", { count: summaries.length });
    return NextResponse.json({ summaries });
  } catch (error) {
    log.error(
      "failed to read summaries",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Failed to read summaries" }, { status: 500 });
  }
}
