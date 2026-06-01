import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeCard, deriveSteps } from "./RecipeCard";
import { useBarStore, DEFAULT_AMBIANCE, type RecipeCardData } from "@/lib/store";

const recipe: RecipeCardData = {
  id: "11007",
  name: "Margarita",
  category: "Ordinary Drink",
  alcoholic: "Alcoholic",
  glass: "Cocktail glass",
  instructions: "Rub rim with lime. Shake with ice. Strain into glass.",
  ingredients: [
    { name: "Tequila", measure: "1 1/2 oz" },
    { name: "Lime juice", measure: "1 oz" },
  ],
  thumb: null,
};

function reset() {
  localStorage.clear();
  useBarStore.setState({
    recipe: null,
    timers: [],
    shoppingList: [],
    ambiance: DEFAULT_AMBIANCE,
  });
}

describe("deriveSteps", () => {
  it("prefers explicit steps when present", () => {
    expect(deriveSteps({ ...recipe, steps: ["A", "B"] })).toEqual(["A", "B"]);
  });

  it("splits instructions into sentence steps when no steps given", () => {
    expect(deriveSteps(recipe)).toEqual([
      "Rub rim with lime.",
      "Shake with ice.",
      "Strain into glass.",
    ]);
  });

  it("returns an empty list when there is nothing to show", () => {
    expect(deriveSteps({ ...recipe, instructions: null, steps: undefined })).toEqual([]);
  });
});

describe("RecipeCard", () => {
  beforeEach(reset);

  it("shows an empty prompt when no recipe is set", () => {
    render(<RecipeCard />);
    expect(screen.getByTestId("recipe-card-empty")).toBeInTheDocument();
  });

  it("renders the recipe name, badges, ingredients and steps", () => {
    useBarStore.setState({ recipe });
    render(<RecipeCard />);

    expect(screen.getByRole("heading", { name: "Margarita" })).toBeInTheDocument();
    expect(screen.getByText("Cocktail glass")).toBeInTheDocument();
    expect(screen.getByText("Tequila")).toBeInTheDocument();
    expect(screen.getByText("1 1/2 oz")).toBeInTheDocument();
    expect(screen.getByText("Shake with ice.")).toBeInTheDocument();
  });

  it("dismisses the recipe when the close button is clicked", async () => {
    useBarStore.setState({ recipe });
    render(<RecipeCard />);
    await userEvent.click(screen.getByRole("button", { name: /dismiss recipe/i }));
    expect(useBarStore.getState().recipe).toBeNull();
    expect(screen.getByTestId("recipe-card-empty")).toBeInTheDocument();
  });
});
