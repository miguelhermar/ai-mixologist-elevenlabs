import { describe, it, expect } from "vitest";
import {
  EMPTY_FORM,
  DEFAULT_DYNAMIC_VARIABLES,
  mergeSpirits,
  buildDynamicVariables,
  type PersonalizationForm,
} from "./personalization";

describe("mergeSpirits", () => {
  it("returns empty string when nothing is provided", () => {
    expect(mergeSpirits([], "")).toBe("");
  });

  it("joins checked spirits", () => {
    expect(mergeSpirits(["Gin", "Lime"], "")).toBe("Gin, Lime");
  });

  it("splits, trims, and appends free-text extras", () => {
    expect(mergeSpirits(["Gin"], " tonic , lime ")).toBe("Gin, tonic, lime");
  });

  it("de-duplicates case-insensitively, preserving first-seen order", () => {
    expect(mergeSpirits(["Gin", "gin"], "GIN, tonic")).toBe("Gin, tonic");
  });

  it("drops empty free-text fragments", () => {
    expect(mergeSpirits([], "rum,,, ,vodka")).toBe("rum, vodka");
  });
});

describe("buildDynamicVariables", () => {
  it("fills every variable with defaults for a blank form (placeholders don't apply at runtime)", () => {
    expect(buildDynamicVariables(EMPTY_FORM)).toEqual(DEFAULT_DYNAMIC_VARIABLES);
  });

  it("falls back to defaults for blank/whitespace fields rather than omitting them", () => {
    const form: PersonalizationForm = {
      userName: "   ",
      tasteProfile: "",
      abvMode: "",
      spirits: [],
      extraSpirits: "  ",
    };
    expect(buildDynamicVariables(form)).toEqual(DEFAULT_DYNAMIC_VARIABLES);
  });

  it("uses filled fields (trimmed) and defaults the rest", () => {
    const form: PersonalizationForm = {
      userName: "  Miguel ",
      tasteProfile: "citrusy, not too sweet",
      abvMode: "low-abv",
      spirits: ["Gin"],
      extraSpirits: "lime",
    };
    expect(buildDynamicVariables(form)).toEqual({
      user_name: "Miguel",
      taste_profile: "citrusy, not too sweet",
      abv_mode: "low-abv",
      available_spirits: "Gin, lime",
    });
  });

  it("produces only string values (SDK accepts primitives only)", () => {
    const form: PersonalizationForm = {
      ...EMPTY_FORM,
      userName: "Sam",
      abvMode: "zero-proof",
    };
    const vars = buildDynamicVariables(form);
    expect(Object.values(vars).every((v) => typeof v === "string")).toBe(true);
    expect(vars).toEqual({
      user_name: "Sam",
      taste_profile: DEFAULT_DYNAMIC_VARIABLES.taste_profile,
      abv_mode: "zero-proof",
      available_spirits: DEFAULT_DYNAMIC_VARIABLES.available_spirits,
    });
  });
});
