import { NextResponse } from "next/server";
import { lookupById, CocktailDbError } from "@/lib/cocktaildb";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/cocktails/[id]");

export const dynamic = "force-dynamic";

/**
 * GET /api/cocktails/{id}
 * Server tool `get_cocktail_details`. Returns one trimmed full recipe, or 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  log.info("details requested", { id });

  if (!id) {
    return NextResponse.json({ error: "Missing cocktail id" }, { status: 400 });
  }

  try {
    const cocktail = await lookupById(id);
    if (!cocktail) {
      log.info("details not found", { id });
      return NextResponse.json({ error: "Cocktail not found" }, { status: 404 });
    }
    log.info("details ok", { id, name: cocktail.name });
    return NextResponse.json({ cocktail });
  } catch (error) {
    const status = error instanceof CocktailDbError ? error.status : 502;
    log.error(
      `details failed (${status})`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Failed to fetch cocktail details" }, { status });
  }
}
