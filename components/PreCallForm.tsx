"use client";

import {
  ABV_OPTIONS,
  COMMON_SPIRITS,
  type PersonalizationForm,
} from "@/lib/personalization";

/**
 * The optional pre-call personalization form (Phase 4). Collects the four
 * dynamic variables — name, taste profile, ABV preference, available spirits —
 * that get passed to the agent at `startSession`. Everything is optional; the
 * agent falls back to placeholder defaults for anything left blank.
 *
 * Controlled component: the parent ([BarConcierge](./BarConcierge.tsx)) owns the
 * form state and reads it when the guest connects.
 */
export function PreCallForm({
  value,
  onChange,
  disabled = false,
}: {
  value: PersonalizationForm;
  onChange: (next: PersonalizationForm) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof PersonalizationForm>(
    key: K,
    v: PersonalizationForm[K]
  ) => onChange({ ...value, [key]: v });

  const toggleSpirit = (spirit: string) => {
    const has = value.spirits.includes(spirit);
    set(
      "spirits",
      has
        ? value.spirits.filter((s) => s !== spirit)
        : [...value.spirits, spirit]
    );
  };

  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-4 text-left disabled:opacity-60"
      aria-label="Personalize your visit (optional)"
    >
      <legend className="text-xs uppercase tracking-[0.2em] text-current/60">
        Personalize your visit — optional
      </legend>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-current/75">Your name</span>
        <input
          type="text"
          value={value.userName}
          onChange={(e) => set("userName", e.target.value)}
          placeholder="What should I call you?"
          autoComplete="given-name"
          className="rounded-lg border border-current/15 bg-current/[0.04] px-3 py-2 text-current placeholder:text-current/40 focus:border-current/40 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-current/75">Taste profile</span>
        <input
          type="text"
          value={value.tasteProfile}
          onChange={(e) => set("tasteProfile", e.target.value)}
          placeholder="e.g. citrusy and not too sweet"
          className="rounded-lg border border-current/15 bg-current/[0.04] px-3 py-2 text-current placeholder:text-current/40 focus:border-current/40 focus:outline-none"
        />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-current/75">Alcohol preference</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Alcohol preference">
          {ABV_OPTIONS.map((opt) => {
            const active = value.abvMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  set("abvMode", active ? "" : opt.value)
                }
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active
                    ? "border-amber-400 bg-amber-400 font-semibold text-stone-950"
                    : "border-current/20 text-current/75 hover:border-current/40"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-current/75">What have you got on hand?</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Available spirits">
          {COMMON_SPIRITS.map((spirit) => {
            const active = value.spirits.includes(spirit);
            return (
              <button
                key={spirit}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSpirit(spirit)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active
                    ? "border-amber-400 bg-amber-400/90 font-medium text-stone-950"
                    : "border-current/20 text-current/75 hover:border-current/40"
                }`}
              >
                {spirit}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={value.extraSpirits}
          onChange={(e) => set("extraSpirits", e.target.value)}
          placeholder="Anything else? (comma-separated)"
          aria-label="Other ingredients"
          className="rounded-lg border border-current/15 bg-current/[0.04] px-3 py-2 text-current placeholder:text-current/40 focus:border-current/40 focus:outline-none"
        />
      </div>
    </fieldset>
  );
}
