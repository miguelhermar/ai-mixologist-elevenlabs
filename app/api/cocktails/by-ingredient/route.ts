import { NextRequest, NextResponse } from "next/server";
import { filterByIngredient, CocktailDbError } from "@/lib/cocktaildb";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/cocktails/by-ingredient");

export const dynamic = "force-dynamic";

/**
 * GET /api/cocktails/by-ingredient?ingredient=Gin
 * Server tool `find_cocktails_by_ingredient`. Returns slim summaries (name/thumb/id);
 * the agent can follow up with `get_cocktail_details` for a full recipe.
 */
export async function GET(req: NextRequest) {
  const ingredient = req.nextUrl.searchParams.get("ingredient")?.trim() ?? "";
  log.info("by-ingredient requested", { ingredient });

  if (!ingredient) {
    return NextResponse.json(
      { error: "Missing `ingredient` query param" },
      { status: 400 }
    );
  }

  try {
    const cocktails = await filterByIngredient(ingredient);
    log.info("by-ingredient ok", { count: cocktails.length });
    return NextResponse.json({ cocktails });
  } catch (error) {
    const status = error instanceof CocktailDbError ? error.status : 502;
    log.error(
      `by-ingredient failed (${status})`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Failed to find cocktails by ingredient" },
      { status }
    );
  }
}
