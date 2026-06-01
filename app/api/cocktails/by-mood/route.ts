import { NextRequest, NextResponse } from "next/server";
import { suggestByMood, MOODS, CocktailDbError, type AbvMode } from "@/lib/cocktaildb";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/cocktails/by-mood");

export const dynamic = "force-dynamic";

const ABV_MODES: AbvMode[] = ["regular", "low-abv", "zero-proof"];

/**
 * GET /api/cocktails/by-mood?mood=sour&abv_mode=low-abv
 * Server tool `suggest_by_mood`. Curated mood→ingredient map + ABV filtering.
 */
export async function GET(req: NextRequest) {
  const mood = req.nextUrl.searchParams.get("mood")?.trim() ?? "";
  const abvParam = req.nextUrl.searchParams.get("abv_mode")?.trim() ?? "regular";
  const abvMode: AbvMode = ABV_MODES.includes(abvParam as AbvMode)
    ? (abvParam as AbvMode)
    : "regular";
  log.info("by-mood requested", { mood, abvMode });

  if (!mood) {
    return NextResponse.json(
      { error: "Missing `mood` query param", knownMoods: MOODS },
      { status: 400 }
    );
  }

  try {
    const cocktails = await suggestByMood(mood, abvMode);
    log.info("by-mood ok", { count: cocktails.length });
    return NextResponse.json({ mood, abv_mode: abvMode, cocktails });
  } catch (error) {
    const status = error instanceof CocktailDbError ? error.status : 502;
    log.error(`by-mood failed (${status})`, error instanceof Error ? error.message : error);
    // A 400 (unknown mood) is useful for the LLM to self-correct; surface known moods.
    const body =
      status === 400
        ? { error: "Unknown mood", knownMoods: MOODS }
        : { error: "Failed to suggest cocktails by mood" };
    return NextResponse.json(body, { status });
  }
}
