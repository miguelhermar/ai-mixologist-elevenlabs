/**
 * Visual themes for the `set_ambiance` client tool. Kept out of the component so
 * the mapping is unit-testable and the set of modes stays in lockstep with the
 * store's {@link Ambiance} union.
 */

import type { Ambiance } from "@/lib/store";

export interface AmbianceTheme {
  /** Human label shown in the header badge. */
  label: string;
  /** Page-level background + base text color (applied to the dashboard wrapper). */
  page: string;
  /** Accent color for the eyebrow/title flourish. */
  accent: string;
  /** A short evocative descriptor (used in the badge tooltip / aria). */
  blurb: string;
}

export const AMBIANCE_THEME: Record<Ambiance, AmbianceTheme> = {
  speakeasy: {
    label: "Speakeasy",
    page: "bg-stone-950 text-amber-50",
    accent: "text-amber-300/80",
    blurb: "low light, warm amber",
  },
  tiki: {
    label: "Tiki",
    page: "bg-gradient-to-b from-teal-950 via-emerald-950 to-stone-950 text-emerald-50",
    accent: "text-orange-300/90",
    blurb: "tropical teal and sunset orange",
  },
  bright: {
    label: "Bright",
    page: "bg-amber-50 text-stone-900",
    accent: "text-amber-600",
    blurb: "clean and well-lit",
  },
};

export function ambianceTheme(mode: Ambiance): AmbianceTheme {
  return AMBIANCE_THEME[mode] ?? AMBIANCE_THEME.speakeasy;
}
