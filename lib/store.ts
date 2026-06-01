/**
 * The on-screen "bar" state, driven by the agent's client tools (Phase 3).
 *
 * The voice agent can't draw on the screen itself — instead it calls *client
 * tools* (run in the browser) that mutate this store, and the React components
 * subscribe to it. So "show me that recipe" → `show_recipe_card` → `showRecipe`
 * → the <RecipeCard> re-renders. One small, well-typed store keeps the tool
 * handlers (lib/clientTools.ts) trivial and the UI declarative.
 *
 * Persistence (user choice, Phase 3): the **shopping list** and **ambiance**
 * survive a reload via zustand's `persist` middleware (localStorage). The recipe
 * card and timers are intentionally session-only — a recipe is ephemeral and a
 * timer is wall-clock based, so neither is meaningful to restore.
 *
 * `skipHydration` is on so the server render and first client render match
 * (no localStorage on the server); the dashboard calls `rehydrate()` on mount.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CocktailDetail } from "@/lib/cocktaildb";

/** Visual themes the `set_ambiance` tool can switch between. */
export type Ambiance = "speakeasy" | "tiki" | "bright";
export const AMBIANCE_MODES: readonly Ambiance[] = ["speakeasy", "tiki", "bright"];
export const DEFAULT_AMBIANCE: Ambiance = "speakeasy";

/** A live countdown shown on screen (shake/steep/chill). Wall-clock based. */
export interface BarTimer {
  id: string;
  label: string;
  /** Epoch ms when the timer reaches zero. */
  endsAt: number;
  /** Original duration, so the UI can show a sensible label. */
  durationSecs: number;
}

/**
 * What the recipe card renders. It's the Phase 2 {@link CocktailDetail} shape
 * (so the agent can pass back exactly what the server tools returned), plus an
 * optional explicit `steps` list — when absent the card derives steps from
 * `instructions`.
 */
export interface RecipeCardData extends CocktailDetail {
  steps?: string[];
}

export interface BarState {
  // ---- state ----
  recipe: RecipeCardData | null;
  timers: BarTimer[];
  shoppingList: string[];
  ambiance: Ambiance;

  // ---- actions ----
  showRecipe: (recipe: RecipeCardData) => void;
  clearRecipe: () => void;
  /** Start a countdown; returns the created timer (handy for tests/logging). */
  startTimer: (seconds: number, label: string) => BarTimer;
  removeTimer: (id: string) => void;
  /** Append items, de-duplicated case-insensitively; returns the new list. */
  addToShoppingList: (items: string[]) => string[];
  removeFromShoppingList: (item: string) => void;
  clearShoppingList: () => void;
  setAmbiance: (mode: Ambiance) => void;
}

const STORE_KEY = "last-call:bar";

/** Stable-ish id without pulling in a dependency. */
function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const norm = (s: string) => s.trim();

/**
 * Merge `items` into `existing`, dropping blanks and case-insensitive dupes
 * while preserving the first-seen casing and order.
 */
export function mergeShoppingItems(existing: string[], items: string[]): string[] {
  const seen = new Set(existing.map((i) => i.toLowerCase()));
  const next = [...existing];
  for (const raw of items) {
    const item = norm(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

export const useBarStore = create<BarState>()(
  persist(
    (set, get) => ({
      recipe: null,
      timers: [],
      shoppingList: [],
      ambiance: DEFAULT_AMBIANCE,

      showRecipe: (recipe) => set({ recipe }),
      clearRecipe: () => set({ recipe: null }),

      startTimer: (seconds, label) => {
        const timer: BarTimer = {
          id: makeId(),
          label: norm(label) || "Timer",
          endsAt: Date.now() + Math.max(0, Math.round(seconds)) * 1000,
          durationSecs: Math.max(0, Math.round(seconds)),
        };
        set((state) => ({ timers: [...state.timers, timer] }));
        return timer;
      },
      removeTimer: (id) =>
        set((state) => ({ timers: state.timers.filter((t) => t.id !== id) })),

      addToShoppingList: (items) => {
        const next = mergeShoppingItems(get().shoppingList, items);
        set({ shoppingList: next });
        return next;
      },
      removeFromShoppingList: (item) =>
        set((state) => ({
          shoppingList: state.shoppingList.filter(
            (i) => i.toLowerCase() !== item.trim().toLowerCase()
          ),
        })),
      clearShoppingList: () => set({ shoppingList: [] }),

      setAmbiance: (mode) => set({ ambiance: mode }),
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only the durable bits survive reloads; recipe + timers stay session-only.
      partialize: (state) => ({
        shoppingList: state.shoppingList,
        ambiance: state.ambiance,
      }),
      // Avoid SSR/first-render hydration mismatches — the dashboard rehydrates on mount.
      skipHydration: true,
    }
  )
);
