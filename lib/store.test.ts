import { describe, it, expect, beforeEach } from "vitest";
import {
  useBarStore,
  mergeShoppingItems,
  DEFAULT_AMBIANCE,
} from "@/lib/store";
import type { RecipeCardData } from "@/lib/store";

const sampleRecipe: RecipeCardData = {
  id: "11007",
  name: "Margarita",
  category: "Ordinary Drink",
  alcoholic: "Alcoholic",
  glass: "Cocktail glass",
  instructions: "Rub the rim with lime. Shake with ice. Strain.",
  ingredients: [
    { name: "Tequila", measure: "1 1/2 oz" },
    { name: "Lime juice", measure: "1 oz" },
  ],
  thumb: "https://www.thecocktaildb.com/images/media/drink/x.jpg",
};

/** Reset the singleton store to a clean slate between tests. */
function resetStore() {
  localStorage.clear();
  useBarStore.setState({
    recipe: null,
    timers: [],
    shoppingList: [],
    ambiance: DEFAULT_AMBIANCE,
  });
}

describe("mergeShoppingItems", () => {
  it("appends new items, preserving order", () => {
    expect(mergeShoppingItems(["Lime"], ["Salt", "Tequila"])).toEqual([
      "Lime",
      "Salt",
      "Tequila",
    ]);
  });

  it("drops blanks and case-insensitive duplicates, keeping first casing", () => {
    expect(
      mergeShoppingItems(["Lime"], ["  ", "lime", "LIME", "Salt"])
    ).toEqual(["Lime", "Salt"]);
  });

  it("trims whitespace on added items", () => {
    expect(mergeShoppingItems([], ["  Simple syrup  "])).toEqual([
      "Simple syrup",
    ]);
  });
});

describe("useBarStore", () => {
  beforeEach(resetStore);

  it("shows and clears a recipe", () => {
    useBarStore.getState().showRecipe(sampleRecipe);
    expect(useBarStore.getState().recipe?.name).toBe("Margarita");
    useBarStore.getState().clearRecipe();
    expect(useBarStore.getState().recipe).toBeNull();
  });

  it("starts a timer with a future endsAt and rounded duration", () => {
    const before = Date.now();
    const timer = useBarStore.getState().startTimer(15, "Shake");
    expect(timer.label).toBe("Shake");
    expect(timer.durationSecs).toBe(15);
    expect(timer.endsAt).toBeGreaterThanOrEqual(before + 15000);
    expect(useBarStore.getState().timers).toHaveLength(1);
  });

  it("defaults a blank timer label and removes by id", () => {
    const t = useBarStore.getState().startTimer(5, "   ");
    expect(t.label).toBe("Timer");
    useBarStore.getState().removeTimer(t.id);
    expect(useBarStore.getState().timers).toHaveLength(0);
  });

  it("adds to the shopping list with de-duplication and returns the list", () => {
    const result = useBarStore.getState().addToShoppingList(["Lime", "lime", "Salt"]);
    expect(result).toEqual(["Lime", "Salt"]);
    expect(useBarStore.getState().shoppingList).toEqual(["Lime", "Salt"]);
  });

  it("removes a shopping item case-insensitively and clears the list", () => {
    useBarStore.getState().addToShoppingList(["Lime", "Salt"]);
    useBarStore.getState().removeFromShoppingList("LIME");
    expect(useBarStore.getState().shoppingList).toEqual(["Salt"]);
    useBarStore.getState().clearShoppingList();
    expect(useBarStore.getState().shoppingList).toEqual([]);
  });

  it("sets the ambiance", () => {
    useBarStore.getState().setAmbiance("tiki");
    expect(useBarStore.getState().ambiance).toBe("tiki");
  });

  it("persists shopping list + ambiance (but not recipe/timers) to localStorage", () => {
    useBarStore.getState().addToShoppingList(["Lime"]);
    useBarStore.getState().setAmbiance("bright");
    useBarStore.getState().showRecipe(sampleRecipe);
    useBarStore.getState().startTimer(10, "Chill");

    const raw = localStorage.getItem("last-call:bar");
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw as string).state;
    expect(persisted.shoppingList).toEqual(["Lime"]);
    expect(persisted.ambiance).toBe("bright");
    // Session-only state must not be persisted.
    expect(persisted.recipe).toBeUndefined();
    expect(persisted.timers).toBeUndefined();
  });
});
