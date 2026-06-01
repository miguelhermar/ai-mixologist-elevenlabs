/**
 * Client tools (Phase 3) — functions the agent calls that run *in the browser*.
 *
 * Unlike the Phase 2 server tools (called by the ElevenLabs cloud over a tunnel),
 * these execute in the user's tab, so they can draw on the screen. Each handler
 * just mutates the zustand bar store (lib/store.ts); the React components react.
 *
 * Registration: the returned map is handed to `startSession({ clientTools })` in
 * BarConcierge. The tool *names and parameter names here must match the agent's
 * client tool configs exactly* (tool_configs/*.json) — that contract is what lets
 * the agent invoke them. `get_shopping_list` is the one that **returns a value**;
 * its config sets `expects_response: true` so the agent receives the list back.
 *
 * Everything is injectable (store, fetch, base URL, logger) so the handlers are
 * unit-testable without a browser or a live agent.
 */

import type { ClientToolsConfig } from "@elevenlabs/client";
import type { BarState, RecipeCardData } from "@/lib/store";
import type { CocktailDetail, Ingredient } from "@/lib/cocktaildb";
import { AMBIANCE_MODES, type Ambiance } from "@/lib/store";
import { createLogger } from "@/lib/logger";

type ClientTools = ClientToolsConfig["clientTools"];

/** Minimal view of the store the handlers need (the zustand store satisfies it). */
export interface BarStoreLike {
  getState: () => BarState;
}

export interface ClientToolDeps {
  store: BarStoreLike;
  /** Same-origin in the browser; overridable for tests. */
  fetchImpl?: typeof fetch;
  /** Base URL for our own API routes (default: same origin / relative). */
  baseUrl?: string;
  logger?: ReturnType<typeof createLogger>;
}

// ---- Parameter shapes (mirror tool_configs/*.json) ----

interface ShowRecipeCardParams {
  /** TheCocktailDB id — when present, the card fetches the canonical recipe. */
  id?: string;
  name?: string;
  glass?: string;
  image?: string;
  ingredients?: Array<{ name: string; measure?: string | null }>;
  steps?: string[];
  instructions?: string;
}

interface StartTimerParams {
  seconds: number;
  label?: string;
}

interface AddToShoppingListParams {
  items: string[];
}

interface SetAmbianceParams {
  mode: string;
}

/** Build a RecipeCardData from inline params (used when no id / fetch fails). */
function recipeFromParams(p: ShowRecipeCardParams): RecipeCardData {
  const ingredients: Ingredient[] = (p.ingredients ?? []).map((i) => ({
    name: i.name,
    measure: i.measure ?? null,
  }));
  return {
    id: p.id ?? "",
    name: p.name ?? "Custom drink",
    category: null,
    alcoholic: null,
    glass: p.glass ?? null,
    instructions: p.instructions ?? (p.steps ? p.steps.join("\n") : null),
    ingredients,
    thumb: p.image ?? null,
    steps: p.steps,
  };
}

/** Coerce/normalize the ambiance, defaulting to speakeasy on anything unexpected. */
function coerceAmbiance(mode: string): Ambiance {
  const m = mode?.trim().toLowerCase();
  return (AMBIANCE_MODES as readonly string[]).includes(m)
    ? (m as Ambiance)
    : "speakeasy";
}

/**
 * Construct the client-tool map for a conversation. Pass the result to
 * `startSession({ clientTools })`.
 */
export function buildClientTools(deps: ClientToolDeps): ClientTools {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = (deps.baseUrl ?? "").replace(/\/$/, "");
  const log = deps.logger ?? createLogger("client-tools");
  const store = () => deps.store.getState();

  return {
    /**
     * Render the recipe card. If an `id` is given we fetch the canonical recipe
     * from our own /api/cocktails/{id} route (so the card always shows accurate
     * specs); otherwise we render whatever the agent passed inline.
     */
    show_recipe_card: async (params: ShowRecipeCardParams) => {
      log.info("show_recipe_card invoked", { id: params?.id, name: params?.name });
      let recipe: RecipeCardData | null = null;

      if (params?.id) {
        try {
          const res = await fetchImpl(`${baseUrl}/api/cocktails/${encodeURIComponent(params.id)}`);
          if (res.ok) {
            const data = (await res.json()) as { cocktail?: CocktailDetail };
            if (data.cocktail) {
              recipe = { ...data.cocktail, steps: params.steps };
              log.debug("show_recipe_card fetched canonical recipe", { id: params.id });
            }
          } else {
            log.warn("show_recipe_card fetch failed", { id: params.id, status: res.status });
          }
        } catch (err) {
          log.warn("show_recipe_card fetch error", {
            id: params.id,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Fall back to inline params if we couldn't fetch (or no id was given).
      if (!recipe) recipe = recipeFromParams(params ?? {});
      store().showRecipe(recipe);
      log.info("show_recipe_card rendered", { name: recipe.name });
    },

    /** Start a visible countdown for a shake/steep/chill step. */
    start_timer: (params: StartTimerParams) => {
      const seconds = Number(params?.seconds) || 0;
      const label = params?.label ?? "Timer";
      const timer = store().startTimer(seconds, label);
      log.info("start_timer invoked", { label: timer.label, seconds: timer.durationSecs });
    },

    /** Append missing ingredients/items to the shopping list. */
    add_to_shopping_list: (params: AddToShoppingListParams) => {
      const items = Array.isArray(params?.items) ? params.items : [];
      const next = store().addToShoppingList(items);
      log.info("add_to_shopping_list invoked", { added: items.length, total: next.length });
    },

    /** Switch the on-screen theme/lighting. */
    set_ambiance: (params: SetAmbianceParams) => {
      const mode = coerceAmbiance(params?.mode ?? "");
      store().setAmbiance(mode);
      log.info("set_ambiance invoked", { mode });
    },

    /**
     * Return the current shopping list to the agent (this tool's config has
     * `expects_response: true`). The agent reads back / acts on the result.
     */
    get_shopping_list: () => {
      const list = store().shoppingList;
      log.info("get_shopping_list invoked", { count: list.length });
      if (list.length === 0) return "The shopping list is empty.";
      return `Shopping list (${list.length}): ${list.join(", ")}.`;
    },
  };
}
