import { NextResponse } from "next/server";
import { randomCocktail, CocktailDbError } from "@/lib/cocktaildb";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/cocktails/random");

export const dynamic = "force-dynamic";

/**
 * GET /api/cocktails/random
 * Server tool `random_cocktail`. Returns one trimmed full recipe.
 */
export async function GET() {
  log.info("random requested");
  try {
    const cocktail = await randomCocktail();
    if (!cocktail) {
      log.warn("random returned no drink");
      return NextResponse.json({ error: "No cocktail available" }, { status: 502 });
    }
    log.info("random ok", { name: cocktail.name });
    return NextResponse.json({ cocktail });
  } catch (error) {
    const status = error instanceof CocktailDbError ? error.status : 502;
    log.error(`random failed (${status})`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to fetch a random cocktail" }, { status });
  }
}
