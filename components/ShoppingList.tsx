"use client";

import { useBarStore } from "@/lib/store";

/**
 * The shopping list — items the agent adds via `add_to_shopping_list` (and which
 * it can read back via `get_shopping_list`). Persisted to localStorage so it
 * survives a reload. Guests can tick items off or clear the list manually.
 */
export function ShoppingList() {
  const items = useBarStore((s) => s.shoppingList);
  const removeItem = useBarStore((s) => s.removeFromShoppingList);
  const clear = useBarStore((s) => s.clearShoppingList);

  return (
    <section
      aria-label="Shopping list"
      data-testid="shopping-list"
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-current/70">
          Shopping list{items.length > 0 ? ` (${items.length})` : ""}
        </h3>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-current/65 underline-offset-2 transition hover:text-current hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-current/65">
          Nothing yet — I&apos;ll add what you&apos;re missing.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center justify-between gap-3 rounded-lg border border-current/10 bg-current/[0.06] px-3 py-1.5 text-sm"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => removeItem(item)}
                aria-label={`Remove ${item}`}
                className="rounded-full px-1.5 text-current/65 transition hover:text-current"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
