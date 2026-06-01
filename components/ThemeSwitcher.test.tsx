import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeSwitcher } from "./ThemeSwitcher";
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

describe("ThemeSwitcher", () => {
  beforeEach(reset);

  it("shows all three themes with the current one pressed", () => {
    render(<ThemeSwitcher />);
    expect(screen.getByRole("button", { name: /speakeasy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tiki/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bright/i })).toBeInTheDocument();
    expect(screen.getByTestId("theme-speakeasy")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("theme-tiki")).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the theme on click", async () => {
    render(<ThemeSwitcher />);
    await userEvent.click(screen.getByTestId("theme-tiki"));
    expect(useBarStore.getState().ambiance).toBe("tiki");
    expect(screen.getByTestId("theme-tiki")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("theme-speakeasy")).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects a voice-driven change (store update) in the highlight", () => {
    render(<ThemeSwitcher />);
    // Simulate the set_ambiance client tool firing (store write outside React).
    act(() => {
      useBarStore.getState().setAmbiance("bright");
    });
    expect(screen.getByTestId("theme-bright")).toHaveAttribute("aria-pressed", "true");
  });
});
