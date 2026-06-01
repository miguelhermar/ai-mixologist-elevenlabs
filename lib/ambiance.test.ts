import { describe, it, expect } from "vitest";
import { ambianceTheme, AMBIANCE_THEME } from "@/lib/ambiance";
import { AMBIANCE_MODES } from "@/lib/store";

describe("ambianceTheme", () => {
  it("has a theme for every ambiance mode", () => {
    for (const mode of AMBIANCE_MODES) {
      expect(AMBIANCE_THEME[mode]).toBeDefined();
      expect(AMBIANCE_THEME[mode].page).toBeTruthy();
      expect(AMBIANCE_THEME[mode].label).toBeTruthy();
    }
  });

  it("returns the matching theme", () => {
    expect(ambianceTheme("tiki").label).toBe("Tiki");
    expect(ambianceTheme("bright").label).toBe("Bright");
  });

  it("falls back to speakeasy for an unexpected mode", () => {
    // @ts-expect-error — exercising the runtime fallback path.
    expect(ambianceTheme("invalid").label).toBe("Speakeasy");
  });
});
