"use client";

import { useBarStore, AMBIANCE_MODES } from "@/lib/store";
import { AMBIANCE_THEME } from "@/lib/ambiance";
import { createLogger } from "@/lib/logger";

const log = createLogger("theme");

/**
 * Header theme switcher (Phase 3 polish).
 *
 * Ambiance is mostly a *voice* feature (`set_ambiance`), but showing all three
 * moods as a segmented control makes them **discoverable** and lets the guest
 * switch by **click** too. It reads `ambiance` from the same store the voice tool
 * writes to, so the highlight stays in sync no matter how the theme was changed.
 */
export function ThemeSwitcher() {
  const ambiance = useBarStore((s) => s.ambiance);
  const setAmbiance = useBarStore((s) => s.setAmbiance);

  return (
    <div
      role="group"
      aria-label="Bar theme"
      data-testid="theme-switcher"
      className="flex items-center gap-1 rounded-full border border-current/20 p-1"
    >
      {AMBIANCE_MODES.map((mode) => {
        const theme = AMBIANCE_THEME[mode];
        const active = mode === ambiance;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => {
              log.info("theme switched via click", { mode });
              setAmbiance(mode);
            }}
            aria-pressed={active}
            title={theme.blurb}
            data-testid={`theme-${mode}`}
            className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.15em] transition ${
              active
                ? "bg-current/15 font-semibold text-current"
                : "text-current/65 hover:text-current"
            }`}
          >
            {theme.label}
          </button>
        );
      })}
    </div>
  );
}
