import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock the ElevenLabs SDK so the embedded BarConcierge doesn't open a connection.
vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useConversationControls: () => ({ startSession: vi.fn(), endSession: vi.fn() }),
  useConversationStatus: () => ({ status: "disconnected" }),
}));

import { Dashboard } from "./Dashboard";
import { useBarStore, DEFAULT_AMBIANCE, type RecipeCardData } from "@/lib/store";

const recipe: RecipeCardData = {
  id: "11007",
  name: "Margarita",
  category: null,
  alcoholic: "Alcoholic",
  glass: "Cocktail glass",
  instructions: "Shake and strain.",
  ingredients: [{ name: "Tequila", measure: "1 1/2 oz" }],
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

describe("Dashboard", () => {
  beforeEach(reset);

  it("lays out the widget and the live panels", () => {
    render(<Dashboard />);
    // The voice widget (its CTA) is present...
    expect(
      screen.getByRole("button", { name: /step up to the bar/i })
    ).toBeInTheDocument();
    // ...alongside the (empty) recipe card and shopping list panels.
    expect(screen.getByTestId("recipe-card-empty")).toBeInTheDocument();
    expect(screen.getByTestId("shopping-list")).toBeInTheDocument();
  });

  it("reflects the current ambiance in the theme switcher after hydration", async () => {
    useBarStore.setState({ ambiance: "tiki" });
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByTestId("theme-tiki")).toHaveAttribute("aria-pressed", "true")
    );
  });

  it("renders a recipe pushed into the store", () => {
    useBarStore.setState({ recipe });
    render(<Dashboard />);
    expect(screen.getByRole("heading", { name: "Margarita" })).toBeInTheDocument();
  });
});
