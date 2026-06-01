"use client";

import Image from "next/image";
import { useBarStore, type RecipeCardData } from "@/lib/store";

/**
 * The recipe card — populated when the agent calls `show_recipe_card`. Reads the
 * current recipe from the bar store and renders ingredients (with measures),
 * glass/ABV badges, and step-by-step instructions so the guest can follow along
 * hands-free while the agent talks.
 */

/** Derive a clean list of steps from explicit `steps` or by splitting instructions. */
export function deriveSteps(recipe: RecipeCardData): string[] {
  if (recipe.steps && recipe.steps.length > 0) {
    return recipe.steps.map((s) => s.trim()).filter(Boolean);
  }
  if (!recipe.instructions) return [];
  return recipe.instructions
    // Split on newlines or sentence boundaries so each step is speakable.
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function RecipeCard() {
  const recipe = useBarStore((s) => s.recipe);
  const clearRecipe = useBarStore((s) => s.clearRecipe);

  if (!recipe) {
    return (
      <section
        aria-label="Recipe card"
        data-testid="recipe-card-empty"
        className="rounded-2xl border border-current/10 bg-current/[0.06] p-6 text-center text-sm text-current/75"
      >
        Ask for a drink and the recipe shows up here.
      </section>
    );
  }

  const steps = deriveSteps(recipe);
  const badges = [recipe.glass, recipe.alcoholic, recipe.category].filter(
    Boolean
  ) as string[];

  return (
    <section
      aria-label="Recipe card"
      data-testid="recipe-card"
      className="overflow-hidden rounded-2xl border border-current/15 bg-current/[0.08] shadow-xl"
    >
      <div className="flex items-start gap-4 p-5">
        {recipe.thumb ? (
          <Image
            src={recipe.thumb}
            alt={recipe.name}
            width={88}
            height={88}
            className="h-22 w-22 shrink-0 rounded-xl object-cover"
            unoptimized
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-semibold leading-tight">{recipe.name}</h2>
            <button
              type="button"
              onClick={clearRecipe}
              aria-label="Dismiss recipe"
              className="rounded-full px-2 text-current/65 transition hover:text-current"
            >
              ✕
            </button>
          </div>
          {badges.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <li
                  key={b}
                  className="rounded-full border border-current/20 px-2 py-0.5 text-xs uppercase tracking-wide text-current/70"
                >
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-current/70">
            Ingredients
          </h3>
          {recipe.ingredients.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {recipe.ingredients.map((ing, i) => (
                <li key={`${ing.name}-${i}`} className="flex justify-between gap-3">
                  <span>{ing.name}</span>
                  {ing.measure ? (
                    <span className="text-current/70">{ing.measure}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-current/65">—</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-current/70">
            Steps
          </h3>
          {steps.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-4 text-sm marker:text-current/65">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-current/65">Just stir and enjoy.</p>
          )}
        </div>
      </div>
    </section>
  );
}
