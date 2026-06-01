import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildClientTools } from "@/lib/clientTools";
import { useBarStore, DEFAULT_AMBIANCE } from "@/lib/store";
import type { CocktailDetail } from "@/lib/cocktaildb";

const canonical: CocktailDetail = {
  id: "11007",
  name: "Margarita",
  category: "Ordinary Drink",
  alcoholic: "Alcoholic",
  glass: "Cocktail glass",
  instructions: "Shake and strain.",
  ingredients: [{ name: "Tequila", measure: "1 1/2 oz" }],
  thumb: "https://www.thecocktaildb.com/x.jpg",
};

function resetStore() {
  localStorage.clear();
  useBarStore.setState({
    recipe: null,
    timers: [],
    shoppingList: [],
    ambiance: DEFAULT_AMBIANCE,
  });
}

/** Quiet logger so handler logs don't clutter test output. */
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function tools(fetchImpl?: typeof fetch) {
  return buildClientTools({
    store: useBarStore,
    fetchImpl,
    logger: silentLogger,
  });
}

describe("buildClientTools", () => {
  beforeEach(resetStore);

  it("exposes exactly the five client tools the agent expects", () => {
    expect(Object.keys(tools()).sort()).toEqual(
      [
        "add_to_shopping_list",
        "get_shopping_list",
        "set_ambiance",
        "show_recipe_card",
        "start_timer",
      ].sort()
    );
  });

  describe("show_recipe_card", () => {
    it("fetches the canonical recipe by id and renders it", async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        json: async () => ({ cocktail: canonical }),
      })) as unknown as typeof fetch;

      await tools(fetchImpl).show_recipe_card({ id: "11007" });

      expect(fetchImpl).toHaveBeenCalledWith("/api/cocktails/11007");
      expect(useBarStore.getState().recipe?.name).toBe("Margarita");
      expect(useBarStore.getState().recipe?.ingredients).toHaveLength(1);
    });

    it("falls back to inline params when the fetch fails", async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      await tools(fetchImpl).show_recipe_card({
        id: "999",
        name: "Improv Sour",
        ingredients: [{ name: "Gin", measure: "2 oz" }],
        steps: ["Shake", "Strain"],
      });

      const recipe = useBarStore.getState().recipe;
      expect(recipe?.name).toBe("Improv Sour");
      expect(recipe?.steps).toEqual(["Shake", "Strain"]);
    });

    it("renders purely from inline params when no id is given (no fetch)", async () => {
      const fetchImpl = vi.fn() as unknown as typeof fetch;

      await tools(fetchImpl).show_recipe_card({
        name: "Garden Spritz",
        glass: "Wine glass",
        ingredients: [{ name: "Prosecco" }],
      });

      expect(fetchImpl).not.toHaveBeenCalled();
      const recipe = useBarStore.getState().recipe;
      expect(recipe?.name).toBe("Garden Spritz");
      expect(recipe?.glass).toBe("Wine glass");
      expect(recipe?.ingredients[0]).toEqual({ name: "Prosecco", measure: null });
    });
  });

  it("start_timer creates a countdown in the store", () => {
    tools().start_timer({ seconds: 20, label: "Steep" });
    const timers = useBarStore.getState().timers;
    expect(timers).toHaveLength(1);
    expect(timers[0].label).toBe("Steep");
    expect(timers[0].durationSecs).toBe(20);
  });

  it("add_to_shopping_list appends and de-duplicates", () => {
    tools().add_to_shopping_list({ items: ["Lime", "Salt"] });
    tools().add_to_shopping_list({ items: ["lime", "Cointreau"] });
    expect(useBarStore.getState().shoppingList).toEqual(["Lime", "Salt", "Cointreau"]);
  });

  it("set_ambiance accepts known modes and coerces unknown to speakeasy", () => {
    tools().set_ambiance({ mode: "TIKI" });
    expect(useBarStore.getState().ambiance).toBe("tiki");
    tools().set_ambiance({ mode: "neon-disco" });
    expect(useBarStore.getState().ambiance).toBe("speakeasy");
  });

  it("get_shopping_list returns a spoken summary (and empty state)", () => {
    expect(tools().get_shopping_list({})).toMatch(/empty/i);
    useBarStore.getState().addToShoppingList(["Lime", "Salt"]);
    const result = tools().get_shopping_list({});
    expect(result).toContain("Lime");
    expect(result).toContain("Salt");
    expect(result).toContain("(2)");
  });
});
