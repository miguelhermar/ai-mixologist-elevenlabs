import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreCallForm } from "./PreCallForm";
import { EMPTY_FORM, type PersonalizationForm } from "@/lib/personalization";

function setup(value: PersonalizationForm = EMPTY_FORM, disabled = false) {
  const onChange = vi.fn();
  render(<PreCallForm value={value} onChange={onChange} disabled={disabled} />);
  return { onChange };
}

describe("PreCallForm", () => {
  it("renders the four personalization inputs", () => {
    setup();
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/taste profile/i)).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /alcohol preference/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /available spirits/i })
    ).toBeInTheDocument();
  });

  it("emits the typed name via onChange", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText(/your name/i), "M");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ userName: "M" })
    );
  });

  it("selecting an ABV option sets that mode", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: /low-abv/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ abvMode: "low-abv" })
    );
  });

  it("clicking the active ABV option clears it (toggle off)", async () => {
    const { onChange } = setup({ ...EMPTY_FORM, abvMode: "regular" });
    await userEvent.click(screen.getByRole("button", { name: /regular/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ abvMode: "" })
    );
  });

  it("toggles a spirit on from empty", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: /^gin$/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ spirits: ["Gin"] })
    );
  });

  it("toggles a spirit off when already selected", async () => {
    const { onChange } = setup({ ...EMPTY_FORM, spirits: ["Gin"] });
    await userEvent.click(screen.getByRole("button", { name: /^gin$/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ spirits: [] })
    );
  });

  it("reflects the current value and marks active chips pressed", () => {
    setup({
      ...EMPTY_FORM,
      userName: "Miguel",
      abvMode: "zero-proof",
      spirits: ["Rum"],
    });
    expect(screen.getByLabelText(/your name/i)).toHaveValue("Miguel");
    expect(screen.getByRole("button", { name: /zero-proof/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /^rum$/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("disables every control when disabled", () => {
    setup(EMPTY_FORM, true);
    expect(screen.getByLabelText(/your name/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /low-abv/i })).toBeDisabled();
  });
});
