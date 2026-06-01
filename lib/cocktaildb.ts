/**
 * TheCocktailDB proxy + reshape helpers.
 *
 * Why this module exists (rather than letting the agent hit TheCocktailDB directly):
 *  1. Reshape/trim the verbose upstream payloads to just what the LLM needs — fewer
 *     tokens, cleaner spoken answers, and a stable shape for the (Phase 3) recipe card.
 *  2. `suggestByMood` adds real server-side logic (a curated mood → ingredient map).
 *  3. One place to log + handle upstream failures.
 *
 * Upstream API (free dev key "1"):
 *   search.php?s=<name>     → full drink objects
 *   filter.php?i=<ing>      → slim objects (name + thumb + id only)
 *   filter.php?a=<kind>     → slim objects, kind = Alcoholic | Non_Alcoholic
 *   lookup.php?i=<id>       → full drink object
 *   random.php              → full drink object
 * No-match responses come back as `{ "drinks": null }`.
 *
 * Like lib/elevenlabs.ts, the upstream `fetch` is injectable so tests never hit the network.
 */

import { createLogger } from "@/lib/logger";

const log = createLogger("cocktaildb");

/** TheCocktailDB base; the key segment is "1" for the public dev tier. */
export function cocktailDbBase(key = process.env.COCKTAILDB_KEY || "1"): string {
  return `https://www.thecocktaildb.com/api/json/v1/${encodeURIComponent(key)}`;
}

/** Error carrying an HTTP status so API routes can mirror/categorize it. */
export class CocktailDbError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CocktailDbError";
    this.status = status;
  }
}

/** ABV preference echoed from the agent's `abv_mode` dynamic variable. */
export type AbvMode = "regular" | "low-abv" | "zero-proof";

/** Trimmed list-result shape (from filter.php, which only returns these three fields). */
export interface CocktailSummary {
  id: string;
  name: string;
  thumb: string | null;
}

/** One measured ingredient line, e.g. { name: "Gin", measure: "2 oz" }. */
export interface Ingredient {
  name: string;
  measure: string | null;
}

/** Trimmed full-recipe shape consumed by the agent and the Phase 3 recipe card. */
export interface CocktailDetail {
  id: string;
  name: string;
  category: string | null;
  alcoholic: string | null;
  glass: string | null;
  instructions: string | null;
  ingredients: Ingredient[];
  thumb: string | null;
}

/** Raw upstream drink object — only the fields we read are typed. */
interface RawDrink {
  idDrink?: string;
  strDrink?: string;
  strDrinkThumb?: string | null;
  strCategory?: string | null;
  strAlcoholic?: string | null;
  strGlass?: string | null;
  strInstructions?: string | null;
  [key: string]: unknown; // strIngredient1..15 / strMeasure1..15
}

interface DrinksEnvelope {
  drinks: RawDrink[] | null;
}

export interface CocktailDbOptions {
  /** Injectable fetch implementation (defaults to global fetch); eases testing. */
  fetchImpl?: typeof fetch;
  /** Override the dev key (defaults to env COCKTAILDB_KEY or "1"). */
  apiKey?: string;
}

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Reshape a slim filter.php object into a {@link CocktailSummary}. */
export function toCocktailSummary(raw: RawDrink): CocktailSummary {
  return {
    id: clean(raw.idDrink) ?? "",
    name: clean(raw.strDrink) ?? "",
    thumb: clean(raw.strDrinkThumb),
  };
}

/**
 * Reshape a full upstream drink into a {@link CocktailDetail}, zipping the flat
 * strIngredient1..15 / strMeasure1..15 pairs into a list and dropping empty slots.
 */
export function toCocktailDetail(raw: RawDrink): CocktailDetail {
  const ingredients: Ingredient[] = [];
  for (let i = 1; i <= 15; i += 1) {
    const name = clean(raw[`strIngredient${i}`]);
    if (!name) continue;
    ingredients.push({ name, measure: clean(raw[`strMeasure${i}`]) });
  }
  return {
    id: clean(raw.idDrink) ?? "",
    name: clean(raw.strDrink) ?? "",
    category: clean(raw.strCategory),
    alcoholic: clean(raw.strAlcoholic),
    glass: clean(raw.strGlass),
    instructions: clean(raw.strInstructions),
    ingredients,
    thumb: clean(raw.strDrinkThumb),
  };
}

/** Low-level GET against TheCocktailDB returning the raw `drinks[]` (or [] when null). */
async function fetchDrinks(
  path: string,
  { fetchImpl = fetch, apiKey }: CocktailDbOptions
): Promise<RawDrink[]> {
  const url = `${cocktailDbBase(apiKey)}/${path}`;
  log.debug("calling thecocktaildb", { path });
  const res = await fetchImpl(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    log.debug("thecocktaildb upstream error", { status: res.status });
    throw new CocktailDbError(`TheCocktailDB request failed (${res.status})`, res.status);
  }
  const data = (await res.json()) as DrinksEnvelope;
  const drinks = data.drinks ?? [];
  log.debug("thecocktaildb ok", { path, count: drinks.length });
  return drinks;
}

/** search.php?s= — full drinks matching a name. */
export async function searchByName(
  name: string,
  opts: CocktailDbOptions = {}
): Promise<CocktailDetail[]> {
  const drinks = await fetchDrinks(`search.php?s=${encodeURIComponent(name)}`, opts);
  return drinks.map(toCocktailDetail);
}

/** filter.php?i= — slim summaries containing an ingredient. */
export async function filterByIngredient(
  ingredient: string,
  opts: CocktailDbOptions = {}
): Promise<CocktailSummary[]> {
  const drinks = await fetchDrinks(`filter.php?i=${encodeURIComponent(ingredient)}`, opts);
  return drinks.map(toCocktailSummary);
}

/** filter.php?a= — slim summaries for an alcoholic class. */
export async function filterByAlcoholic(
  kind: "Alcoholic" | "Non_Alcoholic",
  opts: CocktailDbOptions = {}
): Promise<CocktailSummary[]> {
  const drinks = await fetchDrinks(`filter.php?a=${encodeURIComponent(kind)}`, opts);
  return drinks.map(toCocktailSummary);
}

/** lookup.php?i= — one full drink by id, or null when not found. */
export async function lookupById(
  id: string,
  opts: CocktailDbOptions = {}
): Promise<CocktailDetail | null> {
  const drinks = await fetchDrinks(`lookup.php?i=${encodeURIComponent(id)}`, opts);
  return drinks.length > 0 ? toCocktailDetail(drinks[0]) : null;
}

/** random.php — one full random drink, or null in the unlikely empty case. */
export async function randomCocktail(
  opts: CocktailDbOptions = {}
): Promise<CocktailDetail | null> {
  const drinks = await fetchDrinks("random.php", opts);
  return drinks.length > 0 ? toCocktailDetail(drinks[0]) : null;
}

/**
 * Curated mood → ingredient map. Each mood resolves to a set of TheCocktailDB
 * ingredients; we pull drinks for those and intersect with the ABV filter. Kept
 * deliberately small and well-known so the agent recommends real, makeable drinks.
 */
export const MOOD_MAP: Record<string, string[]> = {
  bright: ["Gin", "Lemon", "Prosecco"],
  sour: ["Lime", "Lemon", "Tequila"],
  boozy: ["Whiskey", "Bourbon", "Rum"],
  refreshing: ["Soda Water", "Cucumber", "Mint"],
  cozy: ["Bourbon", "Brandy", "Cinnamon"],
  celebratory: ["Champagne", "Prosecco", "Vodka"],
  bitter: ["Campari", "Aperol", "Sweet Vermouth"],
  tropical: ["Rum", "Pineapple Juice", "Coconut Liqueur"],
  classic: ["Gin", "Whiskey", "Sweet Vermouth"],
};

/** The moods `suggestByMood` understands (for tool enum + validation). */
export const MOODS = Object.keys(MOOD_MAP);

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Suggest cocktails for a mood, honoring ABV preference.
 *
 * Strategy: resolve the mood to candidate ingredients, fetch the union of drinks
 * for them, then intersect with the relevant ABV class so `zero-proof` only ever
 * returns non-alcoholic drinks (and regular/low-abv stay alcoholic). De-duplicates
 * and caps the result so the agent gets a short, speakable list.
 */
export async function suggestByMood(
  mood: string,
  abvMode: AbvMode = "regular",
  opts: CocktailDbOptions = {},
  limit = 5
): Promise<CocktailSummary[]> {
  const ingredients = MOOD_MAP[norm(mood)];
  if (!ingredients) {
    throw new CocktailDbError(
      `Unknown mood "${mood}". Known moods: ${MOODS.join(", ")}`,
      400
    );
  }
  log.debug("suggestByMood", { mood: norm(mood), abvMode });

  // Union of drinks across the mood's ingredients.
  const byIngredient = await Promise.all(
    ingredients.map((ing) => filterByIngredient(ing, opts).catch(() => []))
  );
  const dedup = new Map<string, CocktailSummary>();
  for (const list of byIngredient) {
    for (const drink of list) {
      if (drink.id && !dedup.has(drink.id)) dedup.set(drink.id, drink);
    }
  }

  // Intersect with the ABV class so we never cross zero-proof / alcoholic lines.
  const kind = abvMode === "zero-proof" ? "Non_Alcoholic" : "Alcoholic";
  const allowed = new Set(
    (await filterByAlcoholic(kind, opts).catch(() => [])).map((d) => d.id)
  );
  const filtered = [...dedup.values()].filter((d) => allowed.has(d.id));

  // If the ABV filter wiped everything out (sparse upstream data), fall back to the
  // mood matches so the agent still has something real to offer.
  const result = filtered.length > 0 ? filtered : [...dedup.values()];
  return result.slice(0, limit);
}
