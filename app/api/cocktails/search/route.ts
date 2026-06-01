import { NextRequest, NextResponse } from "next/server";
import { searchByName, CocktailDbError } from "@/lib/cocktaildb";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/cocktails/search");

// Proxies are live data — never cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/cocktails/search?name=margarita
 * Server tool `search_cocktail_by_name`. Returns trimmed full recipes.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  log.info("search requested", { name });

  if (!name) {
    return NextResponse.json({ error: "Missing `name` query param" }, { status: 400 });
  }

  try {
    const cocktails = await searchByName(name);
    log.info("search ok", { count: cocktails.length });
    return NextResponse.json({ cocktails });
  } catch (error) {
    const status = error instanceof CocktailDbError ? error.status : 502;
    log.error(`search failed (${status})`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to search cocktails" }, { status });
  }
}
