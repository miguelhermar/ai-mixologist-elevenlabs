import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShoppingList } from "./ShoppingList";
import { useBarStore, DEFAULT_AMBIANCE } from "@/lib/store";

function reset() {
  localStorage.clear();
  useBarStore.setState({
    recipe: null,
    timers: [],
    shoppingList: [],
    ambiance: DEFAULT_AMBIANCE,
  });
}

describe("ShoppingList", () => {
  beforeEach(reset);

  it("shows an empty hint when there is nothing on the list", () => {
    render(<ShoppingList />);
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
  });

  it("renders items with a count", () => {
    useBarStore.setState({ shoppingList: ["Lime", "Salt"] });
    render(<ShoppingList />);
    expect(screen.getByText(/shopping list \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText("Lime")).toBeInTheDocument();
    expect(screen.getByText("Salt")).toBeInTheDocument();
  });

  it("removes a single item", async () => {
    useBarStore.setState({ shoppingList: ["Lime", "Salt"] });
    render(<ShoppingList />);
    await userEvent.click(screen.getByRole("button", { name: /remove lime/i }));
    expect(useBarStore.getState().shoppingList).toEqual(["Salt"]);
  });

  it("clears the whole list", async () => {
    useBarStore.setState({ shoppingList: ["Lime", "Salt"] });
    render(<ShoppingList />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(useBarStore.getState().shoppingList).toEqual([]);
  });
});
