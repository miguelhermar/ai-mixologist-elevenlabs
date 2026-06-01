/**
 * Pre-call personalization (Phase 4 — dynamic variables).
 *
 * The guest can fill a short form before connecting; the values become the
 * agent's **dynamic variables** (`{{user_name}}`, `{{taste_profile}}`,
 * `{{abv_mode}}`, `{{available_spirits}}`), passed at `startSession`. The form
 * is optional: any field left blank falls back to a sensible default here, so
 * every referenced `{{var}}` always has a concrete runtime value.
 *
 * Why defaults are sent from the client (not relied on as placeholders): a
 * `{{var}}` referenced in the first message / prompt with **no runtime value**
 * fails the call with "Missing required dynamic variables" — and the agent's
 * `dynamic_variable_placeholders` do **not** fill it in a live session (they
 * only seed the dashboard test UI). Verified live: the agent had placeholders
 * set yet a skip-the-form call still failed on `user_name`. So we always send a
 * value for each variable; the defaults below mirror the placeholder strings.
 *
 * The ElevenLabs SDK only accepts primitive dynamic-variable values
 * (`string | number | boolean`), so the spirits list is joined to a
 * comma-separated string here.
 */

/** ABV preference — mirrors the Phase 2 `suggest_by_mood` tool's values exactly. */
export type AbvMode = "regular" | "low-abv" | "zero-proof";

/** ABV choices for the form (value matches the tool/agent; label is for humans). */
export const ABV_OPTIONS: ReadonlyArray<{ value: AbvMode; label: string }> = [
  { value: "regular", label: "Regular" },
  { value: "low-abv", label: "Low-ABV" },
  { value: "zero-proof", label: "Zero-proof" },
];

/** Quick-pick spirits for the checklist (free text covers anything else). */
export const COMMON_SPIRITS: ReadonlyArray<string> = [
  "Gin",
  "Vodka",
  "Rum",
  "Tequila",
  "Whiskey",
  "Bourbon",
  "Brandy",
  "Campari",
  "Vermouth",
  "Triple sec",
];

/** The pre-call form's state. `abvMode: ""` means "unspecified". */
export interface PersonalizationForm {
  userName: string;
  tasteProfile: string;
  abvMode: AbvMode | "";
  /** Checked common spirits. */
  spirits: string[];
  /** Free-text extras, comma-separated. */
  extraSpirits: string;
}

/**
 * Default values sent when a field is left blank. These mirror the agent's
 * `dynamic_variable_placeholders` so the experience matches the intended copy,
 * but are sent at runtime because placeholders don't fill `{{var}}` references
 * in a live session (see file header).
 */
export const DEFAULT_DYNAMIC_VARIABLES: Record<string, string> = {
  user_name: "friend",
  taste_profile: "no strong preference yet",
  abv_mode: "regular",
  available_spirits: "whatever you have on hand",
};

/** A blank form (nothing specified → defaults above are sent). */
export const EMPTY_FORM: PersonalizationForm = {
  userName: "",
  tasteProfile: "",
  abvMode: "",
  spirits: [],
  extraSpirits: "",
};

/**
 * Merge checked spirits + free-text extras into one clean, de-duplicated,
 * comma-separated string (case-insensitive dedupe, original order preserved).
 * Returns "" when nothing is provided.
 */
export function mergeSpirits(checked: string[], extra: string): string {
  const fromExtra = extra
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [...checked.map((s) => s.trim()).filter(Boolean), ...fromExtra];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of all) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out.join(", ");
}

/**
 * Build the `dynamicVariables` map for `startSession`. Always returns a value
 * for every variable the prompt references — a filled field uses the guest's
 * (trimmed) input, a blank field falls back to `DEFAULT_DYNAMIC_VARIABLES`.
 * This guarantees no referenced `{{var}}` is missing at runtime (placeholders
 * don't cover that in a live session — see file header). Values are all strings
 * (SDK accepts primitives only).
 */
export function buildDynamicVariables(
  form: PersonalizationForm
): Record<string, string> {
  const name = form.userName.trim();
  const taste = form.tasteProfile.trim();
  const spirits = mergeSpirits(form.spirits, form.extraSpirits);

  return {
    user_name: name || DEFAULT_DYNAMIC_VARIABLES.user_name,
    taste_profile: taste || DEFAULT_DYNAMIC_VARIABLES.taste_profile,
    abv_mode: form.abvMode || DEFAULT_DYNAMIC_VARIABLES.abv_mode,
    available_spirits:
      spirits || DEFAULT_DYNAMIC_VARIABLES.available_spirits,
  };
}
