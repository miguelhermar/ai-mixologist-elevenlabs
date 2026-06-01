import { describe, it, expect, vi } from "vitest";
import {
  toCocktailSummary,
  toCocktailDetail,
  searchByName,
  filterByIngredient,
  lookupById,
  randomCocktail,
  suggestByMood,
  cocktailDbBase,
  MOOD_MAP,
} from "./cocktaildb";

/** Minimal full-drink fixture mirroring TheCocktailDB's flat ingredient slots. */
const RAW_MARGARITA = {
  idDrink: "11007",
  strDrink: "Margarita",
  strDrinkThumb: "https://example/marg.jpg",
  strCategory: "Ordinary Drink",
  strAlcoholic: "Alcoholic",
  strGlass: "Cocktail glass",
  strInstructions: "Shake and pour.",
  strIngredient1: "Tequila",
  strIngredient2: "Triple sec",
  strIngredient3: "Lime juice",
  strIngredient4: "", // empty slot — should be dropped
  strIngredient5: null,
  strMeasure1: "1 1/2 oz ",
  strMeasure2: "1/2 oz ",
  strMeasure3: null, // ingredient present, measure missing
};

/** Builds a fetch stub returning the given envelope once. */
const fetchReturning = (drinks: unknown) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ drinks }),
    text: async () => "",
  })) as unknown as typeof fetch;

const fetchFailing = (status: number) =>
  vi.fn(async () => ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => "error",
  })) as unknown as typeof fetch;

describe("cocktailDbBase", () => {
  it("uses the provided key and url-encodes it", () => {
    expect(cocktailDbBase("1")).toBe("https://www.thecocktaildb.com/api/json/v1/1");
  });
});

describe("reshapers", () => {
  it("toCocktailDetail zips ingredients and drops empty/null slots", () => {
    const detail = toCocktailDetail(RAW_MARGARITA);
    expect(detail).toMatchObject({
      id: "11007",
      name: "Margarita",
      category: "Ordinary Drink",
      alcoholic: "Alcoholic",
      glass: "Cocktail glass",
      instructions: "Shake and pour.",
      thumb: "https://example/marg.jpg",
    });
    expect(detail.ingredients).toEqual([
      { name: "Tequila", measure: "1 1/2 oz" },
      { name: "Triple sec", measure: "1/2 oz" },
      { name: "Lime juice", measure: null },
    ]);
  });

  it("toCocktailSummary keeps only id/name/thumb", () => {
    expect(
      toCocktailSummary({ idDrink: "1", strDrink: "Mojito", strDrinkThumb: "t.jpg" })
    ).toEqual({ id: "1", name: "Mojito", thumb: "t.jpg" });
  });

  it("treats blank thumb as null", () => {
    expect(toCocktailSummary({ idDrink: "1", strDrink: "x", strDrinkThumb: "  " }).thumb).toBeNull();
  });
});

describe("fetch helpers", () => {
  it("searchByName returns trimmed details", async () => {
    const fetchImpl = fetchReturning([RAW_MARGARITA]);
    const out = await searchByName("margarita", { fetchImpl });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Margarita");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("search.php?s=margarita"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("filterByIngredient encodes the ingredient and returns summaries", async () => {
    const fetchImpl = fetchReturning([
      { idDrink: "1", strDrink: "Gin Fizz", strDrinkThumb: "t.jpg" },
    ]);
    const out = await filterByIngredient("Soda Water", { fetchImpl });
    expect(out).toEqual([{ id: "1", name: "Gin Fizz", thumb: "t.jpg" }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("filter.php?i=Soda%20Water"),
      expect.anything()
    );
  });

  it("returns [] when upstream sends { drinks: null }", async () => {
    const out = await filterByIngredient("Unobtanium", { fetchImpl: fetchReturning(null) });
    expect(out).toEqual([]);
  });

  it("lookupById returns null when not found", async () => {
    const out = await lookupById("000", { fetchImpl: fetchReturning(null) });
    expect(out).toBeNull();
  });

  it("randomCocktail returns a detail", async () => {
    const out = await randomCocktail({ fetchImpl: fetchReturning([RAW_MARGARITA]) });
    expect(out?.name).toBe("Margarita");
  });

  it("throws CocktailDbError mirroring the upstream status", async () => {
    await expect(searchByName("x", { fetchImpl: fetchFailing(503) })).rejects.toMatchObject({
      name: "CocktailDbError",
      status: 503,
    });
  });
});

describe("suggestByMood", () => {
  it("rejects an unknown mood with a 400 CocktailDbError", async () => {
    await expect(suggestByMood("hangry")).rejects.toMatchObject({
      name: "CocktailDbError",
      status: 400,
    });
  });

  it("intersects mood ingredients with the alcoholic class", async () => {
    // Alcoholic filter allows id 1 & 2; ingredient calls return ids 1,2,3.
    const fetchImpl = vi.fn(async (url: string) => {
      const drinks = url.includes("filter.php?a=Alcoholic")
        ? [
            { idDrink: "1", strDrink: "A", strDrinkThumb: null },
            { idDrink: "2", strDrink: "B", strDrinkThumb: null },
          ]
        : [
            { idDrink: "1", strDrink: "A", strDrinkThumb: null },
            { idDrink: "2", strDrink: "B", strDrinkThumb: null },
            { idDrink: "3", strDrink: "C", strDrinkThumb: null },
          ];
      return { ok: true, status: 200, json: async () => ({ drinks }), text: async () => "" };
    }) as unknown as typeof fetch;

    const out = await suggestByMood("classic", "regular", { fetchImpl });
    expect(out.map((d) => d.id).sort()).toEqual(["1", "2"]);
    // zero-proof must query the Non_Alcoholic class instead.
    await suggestByMood("classic", "zero-proof", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("filter.php?a=Non_Alcoholic"),
      expect.anything()
    );
  });

  it("falls back to mood matches when the ABV filter removes everything", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const drinks = url.includes("filter.php?a=")
        ? [] // ABV class returns nothing → no intersection
        : [{ idDrink: "9", strDrink: "Sour Z", strDrinkThumb: null }];
      return { ok: true, status: 200, json: async () => ({ drinks }), text: async () => "" };
    }) as unknown as typeof fetch;

    const out = await suggestByMood("sour", "low-abv", { fetchImpl });
    expect(out.map((d) => d.id)).toEqual(["9"]);
  });

  it("MOOD_MAP covers the documented moods", () => {
    expect(Object.keys(MOOD_MAP)).toEqual(
      expect.arrayContaining(["bright", "sour", "boozy", "cozy", "tropical", "classic"])
    );
  });
});
