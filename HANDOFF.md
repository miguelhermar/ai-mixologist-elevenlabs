# Session Handoff — Last Call

**Read this first, then [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md).**
This is the running log so a fresh session can continue the build with full context.

- **Project:** "Last Call" — AI mixologist & voice bar concierge on the ElevenLabs
  Agents platform. Full multi-phase plan: [plan.md](plan.md).
- **Last updated:** 2026-06-01 (**production-deploy hardening** session — see "## Session log").
  All six phases complete + live-verified; the app is now wired for a hardened public deploy.
- **🚀 Production deploy hardening (2026-06-01):** prepared the app for a public Vercel + Upstash
  deployment (off the cloudflared tunnel). **No behavior change locally** — every new layer is
  gated on env vars and no-ops without them, so `npm run dev` + tests are unchanged. (1) **Durable
  storage**: [lib/kv.ts](lib/kv.ts) returns an Upstash Redis client when `UPSTASH_REDIS_REST_URL`
  + `_TOKEN` are set; [lib/favorites.ts](lib/favorites.ts) + [lib/callSummaries.ts](lib/callSummaries.ts)
  use Redis then (serverless FS is read-only), else the `.data/*.json` files. Same signatures →
  routes + existing tests untouched. (2) **Quota guard** on the no-login, credit-spending
  `/api/signed-url`: same-origin check ([lib/originGuard.ts](lib/originGuard.ts) → 403) + per-IP
  rate limit ([lib/ratelimit.ts](lib/ratelimit.ts), Upstash → 429) before any session mints.
  (3) **Private analytics**: [proxy.ts](proxy.ts) Basic Auth (`SUMMARY_USER`/`SUMMARY_PASSWORD`)
  on `/summary` + `/api/summaries`; unset → dev-allow, **prod-503**. (4) **[scripts/repoint-tools.mjs](scripts/repoint-tools.mjs)**
  (`npm run tools:repoint`) rewrites the 6 webhook tool URLs from `PUBLIC_BASE_URL` + pushes.
  (5) Migrated `middleware.ts` → **`proxy.ts`** (Next 16 renamed the convention; Node runtime).
  **201 tests** (was 169; +32), tsc/lint/build green. New runbook: **[DEPLOYMENT.md](DEPLOYMENT.md)**.
  **Not yet executed live** — the Vercel/Upstash account setup + first deploy is the next step (needs
  the user to create the accounts). Also fixed the stale Phase-4 dynamic-variable paragraph + runbook
  below to match the corrected "client always sends defaults" behavior.
- **✅ Phase 6 live voice test PASSED (2026-05-31)** — conversation
  `conv_8801kt0hw51hev9ap1p071jpgeqz` (read from the API): **both transfers fired** —
  Last-Call→Sommelier ("Wine — let me bring in our sommelier" → Lily greeted in her own
  voice, paired salmon with Pinot Noir), then Sommelier→Last-Call ("let me pass you back to
  the bar" → "Welcome back to the bar, Miguel!"). **Dynamic vars + context survived the
  transfer in practice** (still knew "Miguel"; the back-transfer did NOT replay the literal
  first message — `enable_transferred_agent_first_message:false` worked). Every prior-phase
  tool fired in the same call + post-call analytics extracted correctly
  (`favorite_cocktail:Margarita`, `abv_mode:low-abv`, `made_a_drink:true`). **`call_successful`
  came back `failure` — not a bug:** `complete_recipe`=success but `responsible_service`=failure
  because the guest asked **low-ABV** and the agent served a standard full-strength Margarita
  without lightening it. **✅ Fixed (post-test polish):** Last Call's prompt now tells it to
  honor low-ABV/zero-proof by *changing what's in the glass* (less spirit, lengthen with
  soda/tonic, swap a zero-proof spirit, or pick a genuinely lighter drink) and say how it
  lightened it — applied to the `# Guest` + `# Goal` sections and re-pushed live. A follow-up
  call should pass `responsible_service`.
- **Status:** ✅ **Phase 6 COMPLETE (built + pushed live + live voice-verified).** The
  optional stretch: a **second "Sommelier" agent** with a **distinct voice (Lily)** and a
  **wine knowledge base (RAG)**, reachable by **bidirectional agent transfer** — Last Call
  hands wine questions to the Sommelier and the Sommelier hands cocktail questions back. The
  transfer happens **server-side inside the same call**, so the same widget/UI is reused and
  the voice + persona simply switch. **169 tests green** (was 161); `tsc`/`lint`/`next build`
  clean; and **both agents were re-fetched from the live API** confirming the full
  `transfer_to_agent` wire shape (the `transfers` array + `agent_id` values) survived the CLI
  push intact, the Sommelier's Lily voice + wine KB + RAG + source attribution are live, and
  the back-transfer points at Last Call. **Not yet live voice-tested** — see the Phase 6
  runbook below to exercise the handoff. New live ids: **Sommelier `agent_0501kt0h021gfs48zhaaah99ec9n`**,
  wine KB doc `LSby2yMwRjmRoWOA9dM7`.
  - **Key facts (verified this session):** (1) the receiving agent uses **its own** prompt /
    first message / voice / tools / KB on transfer (only client-events + audio formats are
    inherited), and the **full transcript is preserved** — so the Sommelier personalizes from
    context. (2) Dynamic-var persistence across a transfer is **undocumented**, so the
    Sommelier references **no `{{var}}`** and the back-transfer disables the receiving first
    message (avoids re-triggering Last Call's `{{user_name}}`). (3) `transfer_to_agent`
    survives `agents push` cleanly — no placeholder-style corruption (caveat 27).

- **Earlier status:** ✅ **Phase 5 COMPLETE — built, automated-verified, config pushed live, and
  live voice-verified end-to-end (2026-05-31).** A real call (sour/low-ABV tequila drink,
  ended via `end_call`) produced the full chain in the server log — `post-call webhook
  received → signature verified → summary persisted (200)` — and `/summary` +
  `GET /api/summaries` showed the AI recap plus the extracted `favorite_cocktail`
  ("Tequila Lime Sparkler"), `taste_profile`, `abv_mode:low-abv`, `made_a_drink:true`, and
  both eval criteria (`complete_recipe`, `responsible_service`) = success. Live webhook id
  `18e3995d4a064cdb9a44e6f4a8b75d09`. (Side note: `save_favorite` only persists DB drinks
  with an id — an *improvised* drink legitimately can't be saved; not a bug.)
  What it added: a HMAC-verified `/api/post-call` sink, a local call-summary store, a
  `/summary` analytics page, and the agent's **evaluation criteria** (`complete_recipe`,
  `responsible_service`) + **data collection** (`favorite_cocktail`, `taste_profile`,
  `abv_mode`, `made_a_drink`). **161 tests green** (was 128); `tsc`/`lint`/`next build`
  clean; the eval + data-collection config was **pushed and re-fetched from the live API**
  with the snake_case `data_collection` keys + `abv_mode.enum` + both criteria intact. To
  reproduce the live test (e.g. after a tunnel restart), follow "Where we are: Phase 5" →
  its runbook (`npm run agent:webhook` mints a fresh secret each time → restart dev).
  - **Key finding (corrects a caveat-20 worry):** `data_collection` IS in the CLI's
    `PRESERVE_CHILD_KEYS`, and our ids are its *direct* children, so `agents push`
    preserves them (the placeholder bug only bit because `user_name` sits one level
    deeper). Plain `npm run agent:push` deploys Phase 5 correctly — no new workaround.

- **Earlier status:** ✅ Phase 4 complete (build + automated + live-config + live-voice verification).
  Added **3 system tools** (`end_call`, `language_detection`, `skip_turn`), a
  **knowledge base** (`bartending-101`) with **RAG + source attribution**, and
  **dynamic variables** via an optional **pre-call personalization form**.
  Verified: **128 tests green** (was 103); `tsc`/`lint`/`next build` all clean; an
  **SSR smoke** returns 200 with the form rendered; and the **live agent was
  re-fetched from the API** confirming every Phase 4 wire shape persisted —
  `built_in_tools` (the 3 system tools with correct `system_tool_type`),
  `knowledge_base[bartending-101, usage_mode auto]`, `rag.enabled=true`,
  `conversation.source_attribution=true`, `language_presets.es`, the 4
  `dynamic_variable_placeholders`, 11 unchanged `tool_ids`, and the **RAG index at
  `succeeded` 100%**. **✅ Live voice end-to-end PASSED (2026-05-31)** — verified by
  reading the conversation transcript from the API (`GET /v1/convai/conversations/{id}`):
  skip-form greeting "friend", KB answer citing "our house bartending guide", full
  Spanish switch (`language_detection`), `skip_turn` waited, and `end_call` ended the
  call (`termination_reason: "end_call tool was called."`), plus all 11 server+client tools.
  - **⚠️ Bug found + fixed during the live test:** `dynamic_variable_placeholders` do
    **NOT** fill a referenced `{{var}}` at runtime (they only seed the dashboard test UI).
    Skipping the form (passing `dynamicVariables:{}`) failed the call with
    `"Missing required dynamic variables in first message: {'user_name'}"` **even though
    placeholders were set on the agent**. Fix: `lib/personalization.ts`
    `buildDynamicVariables` now always sends a concrete value for every var (guest input,
    else a default string). This **corrects the old "omit blanks → placeholders apply"
    design** (see the decision table + caveat 20). Client-side only — no agent re-push.
  - **⚠️ CLI bug found + worked around:** `elevenlabs agents push` (CLI 0.5.3)
    **silently drops `dynamic_variable_placeholders`** — it camelCases the map keys
    (`user_name`→`userName`), breaking the match against the `{{user_name}}` refs, so
    the platform stores `{}`. Without placeholders, a guest who skips the form would hit
    a **"Missing required dynamic variables"** call failure. Fix: a post-push reconcile
    script (`scripts/apply-agent-placeholders.mjs`, wired into `npm run agent:push`) that
    PATCHes them via the REST API (which accepts the snake_case map fine). **Always
    deploy the agent with `npm run agent:push`, not the bare CLI** (see caveat 20).
  - Phases 2 + 3 remain ✅ verified live.

---

## Session log

### 2026-06-01 — QA / consistency pass + full-coverage live re-verification (no new features)
A polish-and-verify session: make every doc/UI surface consistent now that all 6 phases are
built, clean developer jargon out of the **end-user UI**, reset local data, and run a fresh
end-to-end live voice sweep. **No code behavior changed beyond the footer copy.**

- **UI cleanup (user-flagged):** the dashboard footer rendered `Phase 5 · post-call analytics ·
  powered by ElevenLabs Agents` to end users. Changed [Dashboard.tsx](components/Dashboard.tsx)
  footer to **"Powered by ElevenLabs"** + the recap link relabeled **"Your visit recaps →"**.
  This was the *only* developer string rendered in the UI; all other "Phase N" mentions are code
  comments / docs (developer-side — intentionally kept). `npm test` still green after.
- **Doc consistency fixes:** [README.md](README.md) test line `161 tests, 29 files` → **169 / 30**
  + added the Phase 6 test rows. [HANDOFF.md](HANDOFF.md) self-contradictions reconciled (the
  Phase 6 section header / runbook / roadmap row / "what's left" / the `161 green` checklist line
  / the stale "current" version id all now match the top status). plan.md left as the historical
  original (its outdated `convai` CLI naming is already documented in caveat 1).
- **Local data reset (fresh slate for future sessions):** cleared `.data/call-summaries.json`
  **and** `.data/favorites.json` to empty (user asked to start fresh; favorites included).
- **Two live end-to-end voice tests — BOTH PASSED.** Setup: fresh cloudflared tunnel
  (`chart-karma-pilot-extra…`, now dead), re-pushed the 6 server tools, re-registered the
  post-call webhook (`npm run agent:webhook`), restarted dev so the new secret loaded.
  - **Call 1 — `conv_2101kt0shm4hf0f8wb496p2v9skc` (with pre-call form, "Miguel"):** golden path
    end-to-end. Tools fired in order (verified from the API transcript): `find_cocktails_by_ingredient`
    → `set_ambiance` → `get_cocktail_details`(Adam Bomb) → `show_recipe_card` → `add_to_shopping_list`
    → `start_timer` → `save_favorite` → **`transfer_to_agent`→Sommelier** → **`transfer_to_agent`→back**
    → `set_ambiance` → `end_call`. **Bidirectional transfer confirmed** by per-turn
    `agent_metadata.agent_id` (Eric `agent_1301…` → Lily `agent_0501…` → Eric). **Both KBs cited**
    — bartending guide ("instead of simple syrup") *and* the wine KB on Lily's turns (steak →
    Cabernet + serving temp). Post-call analytics: `Adam Bomb` / `abv_mode:regular` /
    `made_a_drink:true` / `complete_recipe:success` / `responsible_service:success`. `save_favorite`
    persisted to `favorites.json`.
  - **Call 2 — `conv_6401kt0t7w0ze12rqs4ygk797h33` (form SKIPPED → "friend" default):** swept the
    remaining capabilities, **entirely in Spanish**. Tools: `language_detection` → `suggest_by_mood`
    (mood=refreshing) → `set_ambiance` → `get_cocktail_details`(Acapulco) → `show_recipe_card` →
    **`get_shopping_list`** (two-way tool — returned "Shopping list (3): Ice, Fruit, Salt", which
    **persisted from Call 1 via localStorage**) → **`skip_turn`** ("necesito coger una lima") →
    `end_call`. Post-call: `Acapulco` / `taste_profile:refreshing` / `made_a_drink:false`. The
    browser console (client-tool logs) reconciled 1:1 with the server/transcript side.
- **Coverage:** ~19 of 21 capabilities exercised live this session. **Only two tools not hit
  live this session:** `search_cocktail_by_name` (by-name) and `random_cocktail` — both are simple
  variants of the same already-proven `/api/cocktails/*` proxy. Low-ABV/zero-proof *adaptation* was
  also not re-exercised this session (both calls were `abv_mode:regular`) but it passed in the
  Phase 5 live test. Nothing behaved unexpectedly; one nice emergent detail — Eric reasoned that an
  Adam Bomb is *blended, not shaken* and adjusted the timer accordingly.
- **Teardown:** cloudflared tunnel killed at end of session. `PUBLIC_BASE_URL` + the 6
  `tool_configs/*.json` urls still point at the now-dead `chart-karma-pilot-extra…` host — **next
  session must start a fresh tunnel and re-push tools + re-register the webhook** (caveats 10, 26).

> **Next session focus (per user):** *enhancements* and *production deployment* (move off the
> ephemeral cloudflared quick-tunnel — e.g. deploy the Next.js app to a real host so the server
> tools + post-call webhook have a stable public URL, then drop the tunnel dance and the per-session
> tool re-push). No outstanding bugs to fix first; the app is feature-complete and live-verified.

---

## Where we are: Phase 1 is done

Phase 1 = "Foundation + live voice round-trip + tests." Delivered a Next.js app with
an embedded voice widget that connects to a live, version-controlled agent. The
agent recommends drinks **conversationally** — no cocktail tools / on-screen UI yet
(those are Phases 2–5).

### Verification state (Phase 1 snapshot — see Phase 2 section above for the current count)
- `npm test` → **14 tests pass** across 3 files *(now **57** after Phase 2)*.
- `npx tsc --noEmit` → clean. `npm run lint` → clean. `npx next build` → succeeds.
- `/api/signed-url` returns a real signed URL through the running app (confirmed).
- Live mic conversation confirmed by the user in-browser.

---

## Where we are: Phase 2 is done

Phase 2 = "Server tools — the agent fetches real cocktail data." Built a proxy over
TheCocktailDB and a favorites store, exposed them as 6 webhook tools, and attached
them to the live agent.

**Built this session:**
- [lib/cocktaildb.ts](lib/cocktaildb.ts) — fetch + reshape (`toCocktailSummary`/
  `toCocktailDetail` zip the flat ingredient slots), `MOOD_MAP` + `suggestByMood`
  (mood→ingredient union ∩ ABV class, with a graceful fallback), injectable `fetch`.
- [lib/favorites.ts](lib/favorites.ts) — local JSON store (`addFavorite`/`readFavorites`),
  creates `.data/favorites.json` on first write.
- Routes: [search](app/api/cocktails/search/route.ts), [by-ingredient](app/api/cocktails/by-ingredient/route.ts),
  [[id]](app/api/cocktails/[id]/route.ts), [random](app/api/cocktails/random/route.ts),
  [by-mood](app/api/cocktails/by-mood/route.ts), [favorites](app/api/favorites/route.ts)
  (Bearer-authed, constant-time compare).
- 6 tool configs in [tool_configs/](tool_configs) + ids in [tools.json](tools.json);
  ids attached to the agent's `prompt.tool_ids`; prompt got a `# Tools` section telling
  it when to call each. Tags bumped to `phase-2`.
- 43 new tests (14 → **57**); `tsc`/`lint`/`build` all clean.

**How it was verified:** local curl + curl through the cloudflared tunnel (real recipes,
ABV-filtered mood results, favorites 401→200 + persisted), pushed-tool schemas re-fetched
from the API (GET query params, POST body, `{id}` path param, secret-`secret_id` header
all intact), and a `simulate-conversation` run showing correct tool selection.

---

## Where we are: Phase 3 is done

Phase 3 = "Client tools + on-screen UI — the agent drives the screen." Built 5
browser-side tools and a live **two-column bar dashboard** the agent controls by voice.

**Built this session:**
- [lib/store.ts](lib/store.ts) — the **zustand** bar store. State: `recipe`, `timers`,
  `shoppingList`, `ambiance`. `persist` middleware saves **only** `shoppingList` +
  `ambiance` to localStorage (user choice); recipe/timers are session-only. `skipHydration`
  + rehydrate-on-mount avoids SSR mismatch. Pure helper `mergeShoppingItems` (dedupe).
- [lib/clientTools.ts](lib/clientTools.ts) — `buildClientTools({store,fetchImpl,logger})`
  returns the 5 handlers. `show_recipe_card` fetches `/api/cocktails/{id}` **browser-side**
  for canonical specs (reusing the Phase 2 route), falling back to inline params for
  improvised drinks. `get_shopping_list` **returns** a spoken summary (its config has
  `expects_response:true`). Everything injectable → unit-testable without a browser.
- [lib/ambiance.ts](lib/ambiance.ts) — `speakeasy`/`tiki`/`bright` theme map (page bg +
  accent), with a speakeasy fallback.
- Components: [Dashboard.tsx](components/Dashboard.tsx) (two-column layout + ambiance
  theming + store rehydrate), [RecipeCard.tsx](components/RecipeCard.tsx) (+ `deriveSteps`),
  [TimerStack.tsx](components/TimerStack.tsx) (one 1s ticker, wall-clock `endsAt`, + 
  `formatRemaining`), [ShoppingList.tsx](components/ShoppingList.tsx). 
  [BarConcierge.tsx](components/BarConcierge.tsx) now builds `clientTools` and passes them
  to `startSession({ clientTools })`. [app/page.tsx](app/page.tsx) renders `<Dashboard/>`.
- 5 client tool configs in [tool_configs/](tool_configs) + ids in [tools.json](tools.json);
  ids appended to the agent's `prompt.tool_ids` (→ 11 tools); prompt's `# Tools` section
  gained a "Screen tools" paragraph. Tag bumped to `phase-3`.
- `next.config.ts` got `images.remotePatterns` for `www.thecocktaildb.com` (recipe thumbs).
- **Polish:** [lib/sound.ts](lib/sound.ts) — a synthesized Web Audio **bell** that rings
  when a timer crosses to "Done!" ([TimerStack.tsx](components/TimerStack.tsx) fires it on
  the live not-done→done transition only; guarded so a missing/blocked AudioContext no-ops).
- **Polish:** [ThemeSwitcher.tsx](components/ThemeSwitcher.tsx) — header segmented control
  (Speakeasy/Tiki/Bright). Makes the moods **discoverable** and switchable by **click** as
  well as voice; reads/writes the same `ambiance` store key as `set_ambiance`, so the two
  stay in sync. Replaced the old static ambiance badge.
- 46 new tests (57 → **103**): store, clientTools, ambiance, sound, RecipeCard, TimerStack,
  ShoppingList, Dashboard, ThemeSwitcher.

**How it was verified:** `npm test` (103 green), `tsc`/`lint`/`next build` clean, schemas
re-fetched from the API (nested array/object params + `expects_response:true` intact), an
SSR smoke (homepage 200), **and a full live voice golden-path** (see top-of-file status —
all 6 server + 5 client tools exercised in-browser; bell added after).

### How to live-test Phase 3 again (runbook — already run once ✅)
Client tools run in the **browser**, so recipe card / timer / shopping list / ambiance /
bell react with **no tunnel** — e.g. *"make up a quick gin sour and show me the card"*. For
the **full golden path** (agent fetches a real drink first), the Phase 2 server tools need
the tunnel: restart cloudflared, repoint `PUBLIC_BASE_URL` + each webhook
`tool_configs/*.json` url, `elevenlabs tools push` (caveat 10). Then: *"I've got tequila and
lime, something sour"* → server tool → *"show me the recipe"* → `show_recipe_card({id})`
(browser fetches `/api/cocktails/{id}`) → *"15-second shake timer"* → `start_timer` (bell on
done) → *"add cointreau to my list"* → `add_to_shopping_list` → *"what's on my list?"* →
`get_shopping_list` (returns) → *"give it a tiki vibe"* → `set_ambiance`. **Watch split:**
server log shows the data-side + the `show_recipe_card` `/api/cocktails/{id}` fetch; the
browser **console** shows `[last-call:client-tools] …` for the four browser-only tools.

### Phase 3 follow-ups
- ~~Theme switching is voice-only.~~ ✅ **Done** — built [ThemeSwitcher.tsx](components/ThemeSwitcher.tsx)
  (header segmented control); moods are now discoverable + clickable as well as voice.
- ~~**`add_to_shopping_list` multi-item nudge.**~~ ✅ **Done** in the Phase 4 prompt pass
  ("if they mention several items at once, pass them all together in a single `items` array").

---

## Where we are: Phase 4 is done

Phase 4 = "System tools + knowledge base (RAG) + dynamic variables." The agent can
now end/pause/switch-language on its own, ground technique answers in a real
bartending doc (citing it), and personalize from an optional pre-call form.

**Built this session:**
- **System tools** — enabled `end_call`, `language_detection`, `skip_turn` inline under
  `conversation_config.agent.prompt.built_in_tools` (NOT via the CLI / `tool_ids`; see
  caveat 21). Each is `{ name, description:"", params:{ system_tool_type:<name> } }`.
  A `# Conversation flow` prompt section tells the agent when to use them.
- **Multilingual** — registered Spanish via `conversation_config.language_presets.es =
  { overrides:{} }` (that's how additional languages are declared — there's no array
  field). **Kept `eleven_flash_v2` + `language:"en"`** — English-primary agents *reject*
  `*_v2_5`; the platform auto-promotes to the multilingual model on a language switch
  (corrects the old plan note that said "switch to a `*_v2_5` model"; see caveat 22).
- **Knowledge base + RAG** — authored [knowledge-base/bartending-101.md](knowledge-base/bartending-101.md)
  (techniques, glassware, measures/ratios, glossary, substitutions, zero-proof swaps).
  Uploaded via the **REST API** (the CLI has no KB commands): `POST /v1/convai/knowledge-base/file`
  → doc id `7JUtybkQNVnO0h9E5s2C`; triggered + polled `POST .../{id}/rag-index`
  (`e5_mistral_7b_instruct`) to `succeeded`. Attached on the agent as
  `prompt.knowledge_base:[{type:"file",name:"bartending-101",id,usage_mode:"auto"}]`,
  `prompt.rag.enabled=true`, and `conversation.source_attribution=true` (so it cites the
  house guide).
- **Dynamic variables** — [lib/personalization.ts](lib/personalization.ts)
  (`buildDynamicVariables` + `mergeSpirits`, fully unit-tested) + an optional
  [components/PreCallForm.tsx](components/PreCallForm.tsx) (name, taste profile, ABV chips,
  spirit checklist + free text). [BarConcierge.tsx](components/BarConcierge.tsx) now passes
  `startSession({ dynamicVariables })`. **`buildDynamicVariables` sends a concrete value for
  EVERY referenced variable** — the guest's input where filled, else a default string — because
  (corrected live, see top-of-file status) `dynamic_variable_placeholders` do **not** fill a
  referenced `{{var}}` at runtime; they only seed the dashboard test UI, and a blank `{{var}}`
  fails the call. The prompt + `first_message` reference `{{user_name}}`/`{{taste_profile}}`/
  `{{abv_mode}}`/`{{available_spirits}}`. `abv_mode` reuses the Phase 2 values
  (`regular`/`low-abv`/`zero-proof`).
- **Deploy hardening** — [scripts/apply-agent-placeholders.mjs](scripts/apply-agent-placeholders.mjs)
  + `npm run agent:push` (now `elevenlabs agents push && node scripts/apply-agent-placeholders.mjs`)
  works around the CLI placeholder-drop bug (caveat 20). Config stays the source of truth.
- 25 new tests (103 → **128**): `lib/personalization.test.ts`, `components/PreCallForm.test.tsx`,
  expanded `components/BarConcierge.test.tsx` (dynamicVariables pass-through), and a new
  `agent_configs/Last-Call.config.test.ts` (wire-shape regression guard for the live config).

**How it was verified:** `npm test` (128 green), `tsc`/`lint`/`next build` clean, an SSR
smoke (homepage 200 with the form), and — the real proof — the **live agent re-fetched from
the API** with every Phase 4 field intact + RAG index `succeeded`. **✅ Live voice test
PASSED (2026-05-31)** — personalized + skip-form greeting, KB citation, Spanish switch,
`skip_turn`, `end_call` all confirmed via the conversation transcript (see top-of-file
status for the one bug found + fixed: client-side dynamic-var defaults).

### How to live-test Phase 4 (runbook — ✅ run & passed 2026-05-31)
1. `npm run dev`; for the Phase 2 server tools, also start cloudflared + repoint
   `PUBLIC_BASE_URL` + each `tool_configs/*.json` url + `elevenlabs tools push` (caveat 10).
2. **Personalization:** fill the pre-call form (e.g. name "Miguel", "citrusy, low-ABV",
   spirits gin+lime), connect → the first message should greet by name; the browser console
   logs `dynamicVariables:[user_name,...]`. Then **skip** the form on a second run → greeting
   uses the "friend" default (the client sends defaults for every var, so the call never errors
   on a missing `{{var}}`; placeholders only seed the dashboard test UI, not live sessions).
3. **Knowledge base:** ask "shake or stir a Negroni?" / "what can I use instead of simple
   syrup?" → grounded answer that **mentions the house guide**.
4. **Language:** say a sentence in **Spanish** → the agent continues in Spanish.
5. **System tools:** "give me a sec to grab a lime" → `skip_turn` (waits); "thanks, that's
   all" → warm send-off + `end_call`.

---

## Where we are: Phase 5 is done (built + live config + live voice-verified ✅)

Phase 5 = "Post-call webhook + analytics." When a conversation ends, ElevenLabs'
cloud POSTs a signed transcription payload to our `/api/post-call` route; we verify
the HMAC signature, reshape the analysis (AI summary + evaluation criteria + data
collection) into a slim record, persist it, and render it on a new `/summary` page.

**Built this session:**
- [lib/postcall.ts](lib/postcall.ts) + [.test.ts](lib/postcall.test.ts) — the pure,
  injectable core: `verifyPostCallSignature` (HMAC scheme mirrored exactly from the
  ElevenLabs JS SDK's `webhooks.constructEvent`), `parsePostCallEvent`, and
  `toCallSummary` (reshape). Returns a structured `{valid:false, reason}` so the route
  logs *why* but answers a generic 401.
- [lib/callSummaries.ts](lib/callSummaries.ts) + [.test.ts](lib/callSummaries.test.ts)
  — local JSON store at `.data/call-summaries.json` (mirrors `lib/favorites.ts`).
  **Upserts by `conversationId`** so a webhook retry doesn't duplicate; reads newest-first.
- [app/api/post-call/route.ts](app/api/post-call/route.ts) + [.test.ts](app/api/post-call/route.test.ts)
  — verify → parse → persist → **200 fast**. Non-transcription events + summaries with
  no conversation id are acknowledged (200) and ignored, not errored.
- [app/api/summaries/route.ts](app/api/summaries/route.ts) + [.test.ts](app/api/summaries/route.test.ts)
  — `GET` list (newest-first) backing the page + handy for `curl`-verifying persistence live.
- [app/summary/page.tsx](app/summary/page.tsx) + [components/CallSummaryList.tsx](components/CallSummaryList.tsx)
  + [.test.tsx](components/CallSummaryList.test.tsx) — a **dedicated `/summary` page**
  (server component, `force-dynamic`, reads the store directly) rendering each call's
  recap, success verdict, data-collection chips, and pass/fail eval criteria.
  [Dashboard.tsx](components/Dashboard.tsx) footer links to it.
- **Agent config** ([agent_configs/Last-Call.json](agent_configs/Last-Call.json)):
  `platform_settings.evaluation.criteria` = `complete_recipe` + `responsible_service`
  (each `{id,name,type:"prompt",conversation_goal_prompt,use_knowledge_base}`);
  `platform_settings.data_collection` = the 4 items (`favorite_cocktail`/`taste_profile`/
  `abv_mode`(enum)/`made_a_drink`(boolean)). `post_call_webhook_id` left **null**
  (environment-specific → applied live by the script, like the tunnel URL). Tag → `phase-5`.
  Guarded by new Phase-5 cases in [Last-Call.config.test.ts](agent_configs/Last-Call.config.test.ts).
- [scripts/register-postcall-webhook.mjs](scripts/register-postcall-webhook.mjs)
  (`npm run agent:webhook`) — creates the HMAC workspace webhook via REST
  (`POST /v1/workspace/webhooks`), writes `POSTCALL_WEBHOOK_SECRET` into `.env.local`,
  PATCHes the agent's `post_call_webhook_id`, and re-GETs to confirm.
- 33 new tests (128 → **161**); `tsc`/`lint`/`next build` clean.

**How it was verified:** `npm test` (161 green), `tsc`/`lint`/`build` clean, the **live
agent re-fetched from the API** (snake_case `data_collection` keys + `abv_mode.enum` + both
eval criteria persisted through the CLI push), and — the real proof — a **live voice call
(2026-05-31)**: a sour/low-ABV tequila round ended via `end_call` produced
`post-call webhook received → signature verified → summary persisted (200)` in the server
log, and `/summary` + `GET /api/summaries` showed the AI recap plus
`favorite_cocktail:"Tequila Lime Sparkler"`, `taste_profile`, `abv_mode:low-abv`,
`made_a_drink:true`, and both criteria = success.

### How to go live + test Phase 5 (runbook — ✅ run & passed 2026-05-31; repeat after a tunnel restart)
1. `npm run dev`; start cloudflared + repoint `PUBLIC_BASE_URL` + each
   `tool_configs/*.json` url + `elevenlabs tools push` (caveat 10). The post-call webhook
   is **also a public URL ElevenLabs' cloud calls**, so it needs the tunnel too.
2. **Register the webhook:** `npm run agent:webhook` — it derives the URL from
   `PUBLIC_BASE_URL` (`…/api/post-call`), creates the HMAC webhook, saves
   `POSTCALL_WEBHOOK_SECRET` to `.env.local`, and links it to the agent. **Restart
   `npm run dev`** so the new secret loads into the route.
3. **Have a voice call** (golden path), then **end it** (`end_call`). Wait a few seconds.
4. **Check the recap:** open `/summary` (or `curl $PUBLIC_BASE_URL/api/summaries`) — the
   call should appear with the AI summary, the extracted `favorite_cocktail`/`taste_profile`/
   `abv_mode`/`made_a_drink`, and the two eval criteria as met/not-met.
5. **Watch the server log:** `post-call webhook received → signature verified → summary
   persisted`. A `signature rejected {reason:…}` line means the secret/tunnel is stale
   (re-run step 2 and restart dev). Analysis can take a little after the call ends.

---

## Where we are: Phase 6 is done (built + pushed live + automated-verified + live voice-verified ✅)

Phase 6 = "Stretch: Sommelier sub-agent + polish." A second agent with a distinct
voice and its own wine knowledge base, reachable by **bidirectional agent transfer**.
The transfer is server-side within the same conversation — the guest keeps the same
widget; only the voice + persona switch — so there is **no new UI**.

**Built this session:**
- [agent_configs/Sommelier.json](agent_configs/Sommelier.json) — the second agent.
  Voice **Lily** (`pFZP5JQG7iQjIQuC4Bku`, British, velvety — distinct from Last Call's
  Eric), `eleven_flash_v2` + `language:"en"`, `gemini-2.5-flash`. Warm, non-snobby
  wine-expert persona; **references no `{{dynamic_variables}}`** (personalizes from the
  preserved transcript instead). `built_in_tools`: `end_call`, `skip_turn`, and
  `transfer_to_agent` **back to Last Call** for cocktail/spirit questions.
- [knowledge-base/wine-pairing-101.md](knowledge-base/wine-pairing-101.md) — the wine KB
  (pairing principles, grape/style profiles, serving temps + glassware, cocktail→wine
  bridges, low/zero-proof). Uploaded + RAG-indexed → doc id `LSby2yMwRjmRoWOA9dM7`;
  attached `usage_mode auto` + `rag.enabled` + `source_attribution` (cites the "house
  cellar notes").
- [scripts/upload-knowledge-base.mjs](scripts/upload-knowledge-base.mjs) — generalizes
  the Phase-4 manual KB steps into a reusable script (`POST file` → `POST rag-index` →
  poll to `succeeded`). Usage: `node scripts/upload-knowledge-base.mjs <path> <name>`.
- [agent_configs/Last-Call.json](agent_configs/Last-Call.json) — added
  `prompt.built_in_tools.transfer_to_agent` pointing at the Sommelier
  (`enable_transferred_agent_first_message:true` so Lily greets on arrival) + a "Wine:"
  paragraph in the prompt telling it to hand wine questions over. `tool_ids` unchanged
  (11). Tag → `phase-6`.
- Tests (161 → **169**): new [agent_configs/Sommelier.config.test.ts](agent_configs/Sommelier.config.test.ts)
  (voice distinct, no dynamic vars, wine KB + RAG + attribution, the three system tools,
  back-transfer shape) + a Phase-6 block in
  [Last-Call.config.test.ts](agent_configs/Last-Call.config.test.ts) (transfer points at
  the live Sommelier id from `agents.json`).

**How it was verified:** `npm test` (169 green), `tsc`/`lint`/`next build` clean, and —
the real proof — **both agents re-fetched from the live API**: Last Call's
`transfer_to_agent` → Sommelier id, condition on "wine", greeting enabled, 11 tool_ids
intact; the Sommelier live with the Lily voice, wine KB (`LSby2yMwRjmRoWOA9dM7`),
`rag.enabled`, `source_attribution`, and a back-transfer → Last Call with the receiving
first message disabled. The whole `transfers` array round-tripped through `agents push`
with no corruption.

### How to live-test Phase 6 (runbook — ✅ run & passed 2026-05-31; repeat as needed)
1. Start the app + a fresh tunnel, repoint tools, register the webhook (the usual Phase 5
   steps — only needed if you also want server tools / analytics during the test). The
   transfer itself needs **no tunnel** (it's cloud-side between two agents).
2. Connect to Last Call as usual. Ask a **wine** question — *"what wine should I serve
   with steak?"* → Last Call says a one-line cue, then you hear **Lily's voice** greet you
   as the sommelier and answer (citing the house cellar notes for pairing facts).
3. Ask the Sommelier to **switch back** — *"actually, can you make me a cocktail instead?"*
   → it transfers back and you hear **Eric's voice** (Last Call) resume, with the prior
   context intact.
4. **If the handoff fails:** diagnose via `GET /v1/convai/conversations/{id}` →
   `metadata.termination_reason`. A missing-dynamic-variables error on the way back would
   mean the `{{user_name}}` first message got re-triggered — confirm the back-transfer's
   `enable_transferred_agent_first_message` is `false`.

---

## Decisions locked in (don't relitigate without reason)

| Decision | Choice | Notes |
|---|---|---|
| Phase 1 scope | Foundation + live voice + tests | per user |
| Provision agent | Created & pushed live this session | agent already exists |
| LLM | `gemini-2.5-flash` | chosen for low voice latency; supports tools |
| TTS model | `eleven_flash_v2` | English-only fast model (see caveat below) |
| Voice | `cjVigY5qzO86Huf0OWal` (template default) | **user confirmed keep it**; will tell us if they want to change |
| Connection | `websocket` via signed URL | per plan |
| Test stack | Vitest + Testing Library + jsdom | unit / integration / component |
| State lib | **zustand** — now the Phase 3 bar store (`lib/store.ts`) | was reserved; now in use |
| Phase 3 layout | **Two-column bar dashboard** | user-chosen (widget left, live panels right) |
| Phase 3 persistence | **localStorage** (shopping list + ambiance only) | user-chosen; recipe/timers session-only |
| `show_recipe_card` data | Fetch canonical recipe by `id` browser-side; inline params only as fallback | accurate specs, reuses `/api/cocktails/{id}`, lighter LLM payload |
| Client-tool registration | `startSession({ clientTools })` (not the `useConversationClientTool` hook) | handlers read store via `getState()`; more unit-testable |
| Phase 4 additional language | **Spanish** (one extra) | user-chosen; via `language_presets.es` |
| Phase 4 TTS model | **Keep `eleven_flash_v2` + `language:"en"`** (NOT `*_v2_5`) | corrects plan/old handoff; English agents reject v2_5, platform auto-promotes on switch (caveat 22) |
| Phase 4 pre-call form | **Optional / skippable** (placeholder defaults fill blanks) | user-chosen; lowest friction + exercises placeholders |
| Phase 4 spirits input | **Checklist + free text** | user-chosen |
| Dynamic-var blanks | ~~Omit so placeholder defaults apply~~ → **Always send a value (guest input or a default string)** | **corrected live 2026-05-31:** placeholders do NOT fill `{{var}}` at runtime (dashboard-only), so omitting blanks failed the call; defaults now sent client-side in `lib/personalization.ts` |
| Agent deploy command | **`npm run agent:push`** (CLI push + placeholder PATCH) | works around CLI placeholder-drop bug (caveat 20) |
| Phase 5 summary surface | **Dedicated `/summary` page** | user-chosen; keeps the live bar dashboard focused; richest history view |
| Phase 5 HMAC verify | **Own `lib/postcall.ts` verifier** (not the SDK's `webhooks.constructEvent`) | mirrors the SDK scheme exactly but stays injectable/testable + avoids instantiating the full SDK client — matches the project's helper pattern |
| Phase 5 webhook id | **Not committed** (`post_call_webhook_id:null`); applied live by `npm run agent:webhook` | the webhook URL is the env-specific tunnel; same reasoning as `PUBLIC_BASE_URL` |
| Phase 5 eval criteria | **`complete_recipe` + `responsible_service`** | one core (makeable recipe) + one persona-fit (responsible service) |
| Phase 5 store | **Local JSON, upsert by `conversationId`** | mirrors `lib/favorites.ts`; idempotent against webhook retries |
| Phase 6 Sommelier voice | **Lily** (`pFZP5JQG7iQjIQuC4Bku`, British velvety) | user-chosen; recognizably distinct from Last Call's Eric on transfer |
| Phase 6 transfer flow | **Bidirectional** (Last Call ↔ Sommelier) | user-chosen; seamless demo — wine to the sommelier, cocktails back to the bar |
| Phase 6 wine knowledge | **Wine KB + RAG** (`wine-pairing-101`) | user-chosen; mirrors the bartending-101 pattern, demonstrates KB on the 2nd agent too |
| Phase 6 Sommelier dynamic vars | **None referenced** (personalize from transcript) | dynamic-var persistence across transfer is undocumented; avoids a caveat-20 failure at handoff |
| Phase 6 back-transfer first message | **Disabled** (`enable_transferred_agent_first_message:false`) | prevents re-triggering Last Call's `{{user_name}}` first message mid-call |
| Low-ABV / zero-proof handling | **Adapt the actual drink** (less spirit / lengthen / zero-proof swap / pick a lighter drink) + say how | post-test polish; the `responsible_service` eval flagged serving a full-strength classic on a low-ABV request |

---

## ⚠️ Caveats & gotchas (these bit us / will bite future self)

1. **The CLI in plan.md is outdated.** plan.md references `@elevenlabs/convai-cli`
   with `convai init/sync/watch` and a `convai/agent_configs/prod/` layout. The
   **actual** tool is **`@elevenlabs/cli`** (binary `elevenlabs`):
   `elevenlabs agents init | add | push | pull | status`. Layout is `agents.json` +
   `agent_configs/*.json` + `tool_configs/` + `test_configs/` at repo root.
   `push` (not `sync`), `pull` (not `fetch`). When following plan.md, **translate
   command names**.
2. **English agents reject `*_v2_5` TTS models.** Setting `eleven_turbo_v2_5` with
   `language: "en"` fails with `"English Agents must use turbo or flash v2."` Use
   `eleven_flash_v2` / `eleven_turbo_v2` for English. **(Superseded by caveat 22:** Phase 4
   kept `eleven_flash_v2` + `language:"en"` and registered Spanish via `language_presets`;
   the platform auto-promotes to the multilingual model on a switch — do NOT hardcode `*_v2_5`.)
3. **React SDK status enum ≠ raw client.** `useConversationStatus()` returns
   `"disconnected" | "connecting" | "connected" | "error"` — **no `"disconnecting"`**
   (the raw `@elevenlabs/client` type has it, but the React provider collapses it).
   `tsc` will fail if you compare against `"disconnecting"`.
4. **API key must be UNRESTRICTED** for the CLI. The user's key is, and it has
   convai access (verified). 
5. **`.env.local` originally held a raw, unnamed key string.** It's now
   `XI_API_KEY=` + `AGENT_ID=`. Don't reintroduce a bare value.
6. **CLI auth is non-interactive via `ELEVENLABS_API_KEY` env.** We push with
   `ELEVENLABS_API_KEY=$XI_API_KEY npx elevenlabs agents push` (avoids the
   interactive `auth login`/keychain flow). Same key value as `XI_API_KEY`.
7. **Tailwind v4** (CSS-first): `app/globals.css` uses `@import "tailwindcss"` and
   `@theme inline {…}` — no `tailwind.config.js`. PostCSS plugin is
   `@tailwindcss/postcss`.
8. **Next 16 removed `next lint`.** The `lint` script is plain `eslint`. Run
   `npm run lint`, not `npx next lint`.

### Phase 2 caveats
9. **Server tools are called by ElevenLabs' CLOUD, not the browser.** They need a
   PUBLIC url — `localhost` won't work. Dev uses a **cloudflared quick tunnel**
   (`cloudflared tunnel --url http://localhost:3000`). The browser widget still works on
   localhost regardless.
10. **Quick-tunnel URLs change on every `cloudflared` restart.** When it changes:
    update `PUBLIC_BASE_URL` in `.env.local` **and** the `url` in each
    `tool_configs/*.json`, then `elevenlabs tools push` (agent push not needed — tool
    ids are unchanged). A named tunnel = stable URL if you want to stop re-pushing.
11. **`elevenlabs tools add` creates the tool REMOTELY immediately** (needs
    `ELEVENLABS_API_KEY`) and writes a *template* config (example.com POST). Workflow:
    `add` to get the id into `tools.json` → overwrite `tool_configs/<name>.json` with the
    real schema → `tools push`. Webhook config wire keys are **snake_case**
    (`query_params_schema`, `path_params_schema`, `request_body_schema`, `request_headers`).
    GET tools use `query_params_schema`/`path_params_schema` (NOT `request_body_schema`).
12. **`save_favorite` Bearer secret is an ElevenLabs WORKSPACE SECRET, referenced by id.**
    Created via `POST /v1/convai/secrets` with body `{"type":"new","name":...,"value":"Bearer <secret>"}`
    → returns `secret_id`. The tool header is `"Authorization": { "secret_id": "<id>" }`
    — so the raw secret is **never** in the committed config. Live secret id:
    `d7I5t9eE2CNFoPGok4zO` (name `LAST_CALL_TOOL_BEARER`). The matching plaintext is
    `TOOL_SHARED_SECRET` in `.env.local`; `/api/favorites` checks it.
13. **`simulate-conversation` MOCKS server tools** — results come back as `"Tool Called."`,
    the webhooks are NOT actually hit (confirmed: no tunnel log entries during a sim). It
    proves the agent *chooses* tools correctly, not the data round-trip. Use real curl
    (done) + a live voice call for the data path. Endpoint:
    `POST /v1/convai/agents/{id}/simulate-conversation` with `{simulation_specification:{simulated_user_config:{first_message,prompt:{prompt}}}, new_turns_limit}`.
14. **TheCocktailDB free key `1` throttles `filter.php`** (`by-ingredient` + the candidate
    lookups inside `by-mood`) to **one result per call**. `search`/`lookup`/`random`
    return full data. Not a bug — code dedups/intersects/falls back. A paid key lifts it.
15. **gemini-2.5-flash can over-call tools / repeat a search** when a tool returns nothing
    useful (seen in the sim because tools were mocked empty). With real data it settles;
    tighten the `# Tools` prompt later if it recurs in live use.

### Phase 3 caveats
16. **Client tools run in the BROWSER — no tunnel needed for them.** Only the Phase 2
    *server* tools need the cloudflared tunnel. `show_recipe_card` fetches
    `/api/cocktails/{id}` **same-origin** from the browser, so it works on localhost even
    with the tunnel down (as long as the agent already has an id). Tool **names + param
    names in `tool_configs/*.json` must match `lib/clientTools.ts` exactly** — that's the
    contract that lets the agent invoke them.
17. **Nested array/object client-tool params are supported** and round-trip intact (verified
    by re-fetching from the API): array = `{type:"array",items:{...}}`, array-of-objects =
    `items:{type:"object",properties:{…}}`. The one **return-a-value** tool
    (`get_shopping_list`) needs `expects_response:true` in its config.
18. **zustand persist + Next SSR:** the store uses `skipHydration:true` and rehydrates in a
    mount `useEffect` ([Dashboard.tsx](components/Dashboard.tsx)) so server + first client
    render match. **Don't** gate hydration with a `useState` flag set inside the effect —
    ESLint `react-hooks/set-state-in-effect` errors on it. Read the store value directly.
19. **Next 16 forbids raw `<img>`** (`@next/next/no-img-element`). Use `next/image` +
    `images.remotePatterns` (added `www.thecocktaildb.com` in `next.config.ts`); external
    thumbs pass `unoptimized`.

### Phase 4 caveats
20. **`elevenlabs agents push` (CLI 0.5.3) silently drops `dynamic_variable_placeholders`.**
    It runs `toCamelCaseKeys` over the whole config; `dynamic_variables` is in its
    `PRESERVE_CHILD_KEYS` set in `'names-only'` mode, which preserves the
    `dynamic_variable_placeholders` *key* but **camelCases the map's child keys**
    (`user_name`→`userName`). That breaks the match against the snake_case `{{user_name}}`
    refs, so the platform stores `{}`. The REST API accepts the snake_case map fine.
    **Workaround (in place):** `npm run agent:push` runs the CLI push **then**
    `scripts/apply-agent-placeholders.mjs`, which PATCHes the placeholders from the committed
    config via `PATCH /v1/convai/agents/{id}`. Use `npm run agent:push` (or run
    `npm run agent:placeholders` after any bare CLI push).
    **⚠️ Correction (live, 2026-05-31):** placeholders alone do **NOT** prevent the
    "Missing required dynamic variables" failure — they only seed the dashboard test UI,
    not live sessions (a skip-form call failed on `{{user_name}}` *with* placeholders set).
    The real fix is client-side: `lib/personalization.ts` always sends a value for every
    referenced var. Placeholders are kept (harmless, good for the dashboard), but **runtime
    no longer depends on them**, so this workaround is now belt-and-suspenders, not load-bearing.
21. **System tools are NOT CLI/`tool_ids` tools.** `elevenlabs tools add` only supports
    `--type webhook|client`. The 3 system tools are declared **inline** under
    `conversation_config.agent.prompt.built_in_tools` as a dict keyed by slot
    (`end_call`/`language_detection`/`skip_turn`/`transfer_to_*`/…); each value is
    `{ name, description, params:{ system_tool_type:<slot> } }`. The live API returns ALL
    slots (most `null`); only the three we set have configs. They never enter `tool_ids`
    (still 11). Verified against the installed `@elevenlabs/elevenlabs-js`
    `BuiltInToolsInput` / `SystemToolConfigInput` types.
22. **Don't hardcode a `*_v2_5` TTS model while `language:"en"`** — English-primary agents
    reject it ("English Agents must use turbo or flash v2"). Additional languages are
    registered via `conversation_config.language_presets[<code>] = { overrides:{} }` (no
    `additional_languages` array exists in the SDK types); the platform auto-promotes to the
    multilingual model when a non-English language is detected. We keep `eleven_flash_v2` +
    `language:"en"` + `language_presets.es`.
23. **Knowledge base / RAG is REST-API only** (the CLI has no KB commands). Create:
    `POST /v1/convai/knowledge-base/file` (multipart `file`,`name`) → `{id}`; markdown
    uploads fine (fall back to `/text` if a `.md` is ever rejected). RAG needs a separate
    index step: `POST /v1/convai/knowledge-base/{id}/rag-index` body `{"model":"<embed>"}`
    (must match `prompt.rag.embedding_model` = `e5_mistral_7b_instruct`); poll the same
    endpoint until `status:"succeeded"`. **Doc must be ≥500 bytes** or it returns
    `document_too_small`. Then attach on the agent: `prompt.knowledge_base` entry
    (`type`/`name`/`id`/`usage_mode:"auto"`) + `prompt.rag.enabled=true`. Citations come
    from `conversation.source_attribution=true`.

### Phase 5 caveats
24. **Post-call webhook HMAC scheme (mirrored from the SDK's `webhooks.constructEvent`).**
    Header `ElevenLabs-Signature` = `t=<unix_seconds>,v0=<hex>`. The signed message is
    `` `${timestamp}.${rawBody}` `` (raw body, **not** re-serialized JSON — read
    `await req.text()`, never `req.json()`, or the hash won't match). Hash = HMAC-SHA256,
    hex, prefixed `v0=`. There's a **30-min timestamp tolerance** (replay guard). Our
    [lib/postcall.ts](lib/postcall.ts) reimplements this exactly + constant-time-compares;
    [app/api/post-call/route.ts](app/api/post-call/route.ts) returns a generic **401** on
    any signature failure (real reason logged), **400** only on a signed-but-unparseable body.
25. **`data_collection` map keys survive `agents push` (unlike placeholders).** `data_collection`
    is in the CLI's `PRESERVE_CHILD_KEYS`, and our ids (`favorite_cocktail`, `made_a_drink`,
    `abv_mode`…) are its **direct** children, so `'names-only'` mode preserves them. The
    Phase-4 placeholder bug (caveat 20) only happened because `user_name` sits one level
    deeper (`dynamic_variables.dynamic_variable_placeholders.user_name`), past the single
    preservation level. **Re-verified live:** the pushed agent kept all four snake_case keys
    + `abv_mode.enum`. `evaluation.criteria` is an **array** of objects, so its field names
    (`conversation_goal_prompt`→camelCase→snake on the wire) round-trip correctly and the
    `id`/`name` string *values* are never touched. **No new push workaround for Phase 5.**
26. **The post-call webhook is a PUBLIC URL ElevenLabs' cloud calls** — like the Phase 2
    server tools, it needs the cloudflared tunnel up (the browser never calls it). It's
    registered separately from the agent push, via `npm run agent:webhook`
    ([scripts/register-postcall-webhook.mjs](scripts/register-postcall-webhook.mjs)):
    `POST /v1/workspace/webhooks` `{settings:{auth_type:"hmac",name,webhook_url}}` →
    `{webhook_id, webhook_secret}` (**secret shown ONCE**, saved to `.env.local` as
    `POSTCALL_WEBHOOK_SECRET`), then a `PATCH` sets the agent's
    `platform_settings.workspace_overrides.webhooks.post_call_webhook_id`. **Restart
    `npm run dev` after registering** so the new secret loads. Re-running makes a *new*
    webhook + repoints the agent (delete stale ones in the dashboard).

### Phase 6 caveats
27. **`transfer_to_agent` is a system tool in `prompt.built_in_tools`** (slot key, like
    `end_call`) — value `{name, description, params:{ system_tool_type:"transfer_to_agent",
    transfers:[{ agent_id, condition, transfer_message?,
    enable_transferred_agent_first_message?, delay_ms? }] }}`. **It survives `agents push`
    intact** (re-fetched live — the `transfers` array + `agent_id` string values round-trip;
    no placeholder-style corruption). The live GET echoes extra fields (`type:"system"`,
    `response_timeout_secs`, `node_id`, `is_workflow_node_transfer`…) — harmless.
28. **On transfer, the receiving agent uses its OWN prompt / first_message / voice / tools /
    knowledge_base.** The parent only forces `client_events` + TTS/ASR audio formats onto the
    child. The **full transcript is preserved**, so the child's LLM sees the prior chat and
    can personalize from it. (Source: ElevenLabs agent-transfer docs + live verification.)
29. **Dynamic-variable persistence across a transfer is NOT documented** — so to avoid a
    caveat-20 "Missing required dynamic variables" failure at handoff, the **Sommelier
    references no `{{var}}`** (it reads the transcript), and the **back-transfer to Last Call
    sets `enable_transferred_agent_first_message:false`** so Last Call's `{{user_name}}`
    first message isn't re-evaluated mid-call. If you ever add a `{{var}}` to the Sommelier,
    re-test the handoff carefully.
30. **`elevenlabs agents add "Name" --from-file <path>`** creates the agent live + adds it to
    `agents.json` — the clean way to (re)create an agent from a hand-authored config. **It
    copies the config to a NEW file** (`Sommelier.json` → `Sommelier-1.json`) and points
    `agents.json` at the copy; consolidate by hand (`rm` the copy, repoint `agents.json` at
    the original). After that, plain `agents push` updates it in place. (We had to recreate
    the Sommelier because a prior session's id had been deleted from the workspace —
    `document_not_found`.)

---

## 👤 User preferences (carry forward to every phase)

- **Mid-level logging is a standing requirement.** The user wants enough
  developer-side logging to hop in and see **where in the workflow** a failure
  happened — a middle ground: not bare, not firehose-verbose. Phase 1 established
  this via [lib/logger.ts](lib/logger.ts) (`createLogger(scope)` → scoped
  `debug/info/warn/error`; `info`/`warn`/`error` always on, `debug` on in dev / via
  `LOG_DEBUG`/`NEXT_PUBLIC_LOG_DEBUG`; secrets redacted via `redact()`).
  **In every new phase, instrument the new workflow paths the same way** — e.g. each
  server tool route should log "requested → upstream call → ok/failed", client tools
  should log invocation + result. Keep it scoped and secret-safe.
- TTS voice `cjVigY5qzO86Huf0OWal`: user confirmed keep it; they'll say if they want a change.

## Live resources (this ElevenLabs workspace)

- **Sommelier sub-agent (Phase 6):** `Sommelier` — id `agent_0501kt0h021gfs48zhaaah99ec9n`,
  voice **Lily** `pFZP5JQG7iQjIQuC4Bku`, wine KB `wine-pairing-101` doc `LSby2yMwRjmRoWOA9dM7`
  (RAG-indexed `succeeded`). Reached **only via transfer** from Last Call; transfers back to
  Last Call for non-wine drinks. Two-way wiring lives in each agent's
  `prompt.built_in_tools.transfer_to_agent`.
- **Agent:** `Last Call` — id `agent_1301kswshvrjfaz954ft54a2z0n3`
- Latest version id `agtvrsn_8101kt0qbakce6vaja45fzebyqak` (current in `agents.json`; bumped by
  the post-test low-ABV prompt polish), branch id `agtbrch_1901kswshx6zf8nsykfs07ada5z9`.
  **Diagnose any failed call** via
  `GET /v1/convai/conversations/{id}` → `metadata.termination_reason` (the browser only
  logs `disconnected {reason:'error'|'agent'}`; `'agent'` = a normal `end_call`).
- **System tools (Phase 4):** `end_call`, `language_detection`, `skip_turn` — inline in
  `prompt.built_in_tools` (not in `tool_ids`). Additional language: Spanish (`language_presets.es`).
- **Knowledge base (Phase 4):** `bartending-101` doc id `7JUtybkQNVnO0h9E5s2C`,
  RAG-indexed (`e5_mistral_7b_instruct`, `succeeded`), `usage_mode auto`, source attribution on.
- **Dynamic variables (Phase 4):** `user_name`/`taste_profile`/`abv_mode`/`available_spirits`.
  **Runtime defaults are sent client-side** (`lib/personalization.ts`) — placeholders on the
  agent are dashboard-only and do NOT fill `{{var}}` live (caveat 20). Placeholders kept via
  `npm run agent:placeholders` for the dashboard, but no longer load-bearing.
- **11 tools** (in `tools.json`). Server (webhook): `search_cocktail_by_name`
  `tool_3401ksxakf1feq79j6sf7mhwyw97` · `find_cocktails_by_ingredient`
  `tool_1601ksxakg3pfv0ryphjggmymx55` · `get_cocktail_details`
  `tool_5001ksxakh2key1a391qb3ca92cz` · `random_cocktail`
  `tool_7601ksxakj2te84vxmdtbnc1dymh` · `suggest_by_mood`
  `tool_5601ksxakk2ge68b164j11dpxcgj` · `save_favorite`
  `tool_1901ksxakm23ezwbz9g49426b2jz`. **Client (Phase 3):** `show_recipe_card`
  `tool_9801ksxyvvzhedyv9swky4w16n42` · `start_timer`
  `tool_9801ksxyvwzafamrkezcn51m5bk5` · `add_to_shopping_list`
  `tool_9101ksxyvxxzfmm9nggm7dzrpt1x` · `set_ambiance`
  `tool_2301ksxyvyw0f8qbgep4yaw9c4jk` · `get_shopping_list`
  `tool_4201ksxyvzstfhe8j9dpv4d0x792`
- **Workspace secret:** `LAST_CALL_TOOL_BEARER` id `d7I5t9eE2CNFoPGok4zO` (the `save_favorite` Bearer).
- **Post-call analytics (Phase 5):** `platform_settings.evaluation.criteria` =
  `complete_recipe` + `responsible_service`; `platform_settings.data_collection` =
  `favorite_cocktail`/`taste_profile`/`abv_mode`(enum)/`made_a_drink`(bool) — **verified
  live on the agent**. `post_call_webhook_id` is still **null** — register the webhook with
  `npm run agent:webhook` (needs the tunnel) to create it + set
  `POSTCALL_WEBHOOK_SECRET`. Recaps land at `/summary` / `GET /api/summaries`, persisted to
  `.data/call-summaries.json`.
- **Dev tunnel (ephemeral):** last session's `PUBLIC_BASE_URL` was
  `https://chart-karma-pilot-extra.trycloudflare.com` (torn down at end of 2026-06-01 session)
  — **dead now; start a new tunnel and re-push tools + re-register the post-call webhook**
  (caveats 10, 26). The committed `tool_configs/*.json` urls + `.env.local` still reference that
  dead host until the next repoint.

---

## Exact stack / versions (as installed)

Node 22.22 · Next 16.2.6 · React 19.2.4 · `@elevenlabs/react` ^1.6.4 ·
`@elevenlabs/cli` ^0.5.3 · Tailwind ^4 · zustand ^5.0.14 · Vitest ^4.1.7 ·
Testing Library (react ^16.3.2, jest-dom ^6.9.1, user-event ^14.6.1) · jsdom ^26.

---

## What got built (file map)

| File | Purpose |
|---|---|
| [app/page.tsx](app/page.tsx) | Landing page; renders `<Dashboard />` (Phase 3) |
| [app/layout.tsx](app/layout.tsx) | Metadata + speakeasy dark theme on `<body>` |
| [app/globals.css](app/globals.css) | Tailwind v4 import + font theme |
| [components/BarConcierge.tsx](components/BarConcierge.tsx) | The voice widget (provider + connect/disconnect/status; Phase 3: registers `clientTools`) |
| [lib/elevenlabs.ts](lib/elevenlabs.ts) | `getSignedUrl()` helper + `SignedUrlError`; injectable `fetch` for tests |
| [lib/logger.ts](lib/logger.ts) | Leveled scoped logger (`createLogger`, `redact`) — workflow tracing |
| [lib/logger.test.ts](lib/logger.test.ts) | Logger unit tests (9) |
| [app/api/signed-url/route.ts](app/api/signed-url/route.ts) | `force-dynamic` GET → `{ signedUrl }` |
| [lib/elevenlabs.test.ts](lib/elevenlabs.test.ts) | Unit tests (7) |
| [app/api/signed-url/route.test.ts](app/api/signed-url/route.test.ts) | Integration tests (3) |
| [components/BarConcierge.test.tsx](components/BarConcierge.test.tsx) | Component tests (4) |
| [vitest.config.ts](vitest.config.ts) / [vitest.setup.ts](vitest.setup.ts) | Test config (jsdom, `@/*` alias, RTL cleanup) |
| [agent_configs/Last-Call.json](agent_configs/Last-Call.json) | The agent, as code (Phase 2: `tool_ids` + `# Tools` prompt) |
| [agents.json](agents.json) | CLI registry (agent id + version/branch) |
| [.env.example](.env.example) | Documented env template |
| [README.md](README.md) / [ARCHITECTURE.md](ARCHITECTURE.md) / [USER-GUIDE.md](USER-GUIDE.md) | Docs |
| **Phase 2 ↓** | |
| [lib/cocktaildb.ts](lib/cocktaildb.ts) + [.test.ts](lib/cocktaildb.test.ts) | TheCocktailDB fetch/reshape/mood (+ unit tests) |
| [lib/favorites.ts](lib/favorites.ts) + [.test.ts](lib/favorites.test.ts) | Local JSON favorites store (+ unit tests) |
| [app/api/cocktails/](app/api/cocktails) | 5 routes (`search`, `by-ingredient`, `[id]`, `random`, `by-mood`) each with a `route.test.ts` |
| [app/api/favorites/route.ts](app/api/favorites/route.ts) + [.test.ts](app/api/favorites/route.test.ts) | Bearer-authed POST + tests |
| [tool_configs/](tool_configs) (6 files) + [tools.json](tools.json) | The 6 webhook tools, as code + id registry |
| **Phase 3 ↓** | |
| [lib/store.ts](lib/store.ts) + [.test.ts](lib/store.test.ts) | zustand bar store (persist: shopping list + ambiance) + `mergeShoppingItems` |
| [lib/clientTools.ts](lib/clientTools.ts) + [.test.ts](lib/clientTools.test.ts) | `buildClientTools` — the 5 browser-side tool handlers |
| [lib/ambiance.ts](lib/ambiance.ts) + [.test.ts](lib/ambiance.test.ts) | speakeasy/tiki/bright theme map |
| [lib/sound.ts](lib/sound.ts) + [.test.ts](lib/sound.test.ts) | Web Audio timer-completion bell (guarded, no asset) |
| [components/ThemeSwitcher.tsx](components/ThemeSwitcher.tsx) + [.test.tsx](components/ThemeSwitcher.test.tsx) | Header mood switcher (voice + click, stays in sync) |
| [components/Dashboard.tsx](components/Dashboard.tsx) + [.test.tsx](components/Dashboard.test.tsx) | Two-column bar dashboard + ambiance theming + rehydrate |
| [components/RecipeCard.tsx](components/RecipeCard.tsx) + [.test.tsx](components/RecipeCard.test.tsx) | Recipe card (+ `deriveSteps`) |
| [components/TimerStack.tsx](components/TimerStack.tsx) + [.test.tsx](components/TimerStack.test.tsx) | Live countdowns (+ `formatRemaining`) |
| [components/ShoppingList.tsx](components/ShoppingList.tsx) + [.test.tsx](components/ShoppingList.test.tsx) | Shopping list panel |
| [tool_configs/](tool_configs) (now 11 files) | + 5 client tool configs (`show_recipe_card`, `start_timer`, `add_to_shopping_list`, `set_ambiance`, `get_shopping_list`) |
| [next.config.ts](next.config.ts) | `images.remotePatterns` for TheCocktailDB thumbs |
| **Phase 4 ↓** | |
| [knowledge-base/bartending-101.md](knowledge-base/bartending-101.md) | The RAG knowledge-base doc (techniques, glassware, measures, glossary, substitutions, zero-proof) |
| [lib/personalization.ts](lib/personalization.ts) + [.test.ts](lib/personalization.test.ts) | `buildDynamicVariables` + `mergeSpirits` + form types/defaults/spirit list/ABV options |
| [components/PreCallForm.tsx](components/PreCallForm.tsx) + [.test.tsx](components/PreCallForm.test.tsx) | Optional pre-call personalization form (controlled) |
| [components/BarConcierge.tsx](components/BarConcierge.tsx) | now owns form state + passes `startSession({ dynamicVariables })` |
| [agent_configs/Last-Call.json](agent_configs/Last-Call.json) | + `built_in_tools`, `language_presets.es`, `source_attribution`, `knowledge_base`, `rag.enabled`, placeholder defaults, prompt sections |
| [agent_configs/Last-Call.config.test.ts](agent_configs/Last-Call.config.test.ts) | Wire-shape regression guard for the Phase 4 **+ Phase 5** live config |
| [scripts/apply-agent-placeholders.mjs](scripts/apply-agent-placeholders.mjs) | Post-push placeholder reconcile (CLI bug workaround); `npm run agent:placeholders` |
| **Phase 5 ↓** | |
| [lib/postcall.ts](lib/postcall.ts) + [.test.ts](lib/postcall.test.ts) | HMAC verify (`ElevenLabs-Signature` `t=,v0=`) + payload parse + `toCallSummary` reshape |
| [lib/callSummaries.ts](lib/callSummaries.ts) + [.test.ts](lib/callSummaries.test.ts) | Local JSON summary store (`.data/call-summaries.json`), upsert by `conversationId` |
| [app/api/post-call/route.ts](app/api/post-call/route.ts) + [.test.ts](app/api/post-call/route.test.ts) | Webhook sink: verify → persist → 200 fast |
| [app/api/summaries/route.ts](app/api/summaries/route.ts) + [.test.ts](app/api/summaries/route.test.ts) | `GET` list of persisted summaries |
| [app/summary/page.tsx](app/summary/page.tsx) | `/summary` analytics page (server component, reads the store) |
| [components/CallSummaryList.tsx](components/CallSummaryList.tsx) + [.test.tsx](components/CallSummaryList.test.tsx) | Renders recap + data collection + eval verdicts (+ `formatDuration`) |
| [agent_configs/Last-Call.json](agent_configs/Last-Call.json) | + `evaluation.criteria`, `data_collection`; tag → `phase-5` |
| [scripts/register-postcall-webhook.mjs](scripts/register-postcall-webhook.mjs) | Create HMAC webhook + write `POSTCALL_WEBHOOK_SECRET` + link agent; `npm run agent:webhook` |
| **Phase 6 ↓** | |
| [agent_configs/Sommelier.json](agent_configs/Sommelier.json) + [.config.test.ts](agent_configs/Sommelier.config.test.ts) | The Sommelier sub-agent (Lily voice, wine persona, wine KB + RAG, `end_call`/`skip_turn`/`transfer_to_agent`-back) + wire-shape guard |
| [knowledge-base/wine-pairing-101.md](knowledge-base/wine-pairing-101.md) | The wine RAG doc (pairing principles, grapes/styles, serving, cocktail→wine bridges, low/zero-proof) |
| [scripts/upload-knowledge-base.mjs](scripts/upload-knowledge-base.mjs) | Reusable KB upload + RAG-index + poll (generalizes the Phase-4 manual steps) |
| [agent_configs/Last-Call.json](agent_configs/Last-Call.json) | + `built_in_tools.transfer_to_agent` → Sommelier + a "Wine:" prompt paragraph; tag → `phase-6` |

`tests.json` / `test_configs/` remain empty (agent-test feature, not used yet).

---

## How to continue (start-of-next-session checklist)

```bash
cd /Users/miguelhermar/Desktop/ElevenLabs
npm install                       # if a fresh checkout
npm test                          # confirm 169 green before changing anything
npm run dev                       # sanity-check the app still connects
npm run agent:status              # confirm the live agent + version

# To exercise server tools again, the OLD tunnel URL is dead — start a fresh one:
cloudflared tunnel --url http://localhost:3000        # copy the https URL
#   → set PUBLIC_BASE_URL in .env.local + the url in each tool_configs/*.json to it
ELEVENLABS_API_KEY=$XI_API_KEY npx elevenlabs tools push

# Deploy agent edits with the wrapper (CLI push + placeholder PATCH — caveat 20):
ELEVENLABS_API_KEY=$XI_API_KEY npm run agent:push

# Phase 5: register the post-call webhook (needs the tunnel up) — creates it,
# writes POSTCALL_WEBHOOK_SECRET to .env.local, links the agent. Restart dev after.
ELEVENLABS_API_KEY=$XI_API_KEY npm run agent:webhook
```

Then pick up the roadmap below. **Keep the test-first discipline**: each phase adds
unit + integration tests alongside the feature.

---

## Roadmap (what's left) — maps to plan.md build steps

| Phase | Scope | plan.md steps | Key new pieces |
|---|---|---|---|
| ~~2~~ ✅ done | **Server tools** | 4 | Built `lib/cocktaildb.ts` + `lib/favorites.ts`, `app/api/cocktails/{search,by-ingredient,[id],random,by-mood}/route.ts`, `app/api/favorites/route.ts` (Bearer). 6 webhook tools in `tool_configs/` pushed + attached. Tunnel via cloudflared; `COCKTAILDB_KEY`/`TOOL_SHARED_SECRET`/`PUBLIC_BASE_URL` added. |
| ~~3~~ ✅ done | **Client tools + UI** | 5 | Built the **zustand** store (`lib/store.ts`), `lib/clientTools.ts` (5 handlers), `lib/ambiance.ts`, + `Dashboard/RecipeCard/TimerStack/ShoppingList`. 5 client tools pushed + attached (11 total). `startSession({clientTools})`. `get_shopping_list` returns a value (`expects_response:true`). Polish: timer bell + clickable ThemeSwitcher. 103 tests. |
| ~~4~~ ✅ done | **System tools + KB/RAG + dynamic variables** | 6,7,8 | Enabled `end_call`/`language_detection`/`skip_turn` (`prompt.built_in_tools`); Spanish via `language_presets` (kept `eleven_flash_v2`, NOT v2_5). Authored + attached `bartending-101` KB (REST API; `usage_mode auto`, `rag.enabled`, `source_attribution`). `PreCallForm` + `lib/personalization.ts` → `startSession({ dynamicVariables })` for the 4 vars; `{{…}}` in the prompt + placeholder defaults. CLI placeholder-drop bug worked around (`npm run agent:push`). 128 tests. |
| ~~5~~ ✅ done | **Post-call webhook + analytics** | 9 | `lib/postcall.ts` (HMAC verify) + `lib/callSummaries.ts` + `app/api/post-call` (verify→persist→200) + `app/api/summaries` + `/summary` page + `CallSummaryList`. Agent `evaluation.criteria` (`complete_recipe`,`responsible_service`) + `data_collection` (`favorite_cocktail`/`taste_profile`/`abv_mode`/`made_a_drink`) pushed + verified live. `register-postcall-webhook.mjs` (`npm run agent:webhook`). 161 tests. **✅ live voice-verified** (recap landed on `/summary`). |
| ~~6~~ ✅ done | **Stretch: Sommelier sub-agent + polish** | 10,11 | Second agent `Sommelier` (Lily voice) + `wine-pairing-101` KB/RAG + **bidirectional `transfer_to_agent`** (Last Call ↔ Sommelier). `scripts/upload-knowledge-base.mjs`. 169 tests; pushed + live-verified wire shape. **✅ Live voice test of the handoff PASSED (2026-05-31)** — both transfers fired (Last Call→Sommelier→Last Call), context survived. |

### What's left (so the next session starts fast)
- **All six planned phases are now BUILT and live voice-verified end-to-end** (Phase 6 handoff
  test passed 2026-05-31 — say *"what wine goes with steak?"* → Lily, then *"make me a
  cocktail"* → back to Eric; both transfers fired and context survived).
- Start-of-session: `npm test` → **169 green**, `npm run dev`, `npm run agent:status` (now
  lists **two** agents). The agent-transfer itself needs **no tunnel**; the Phase 2 server
  tools + the Phase 5 post-call webhook still do (fresh tunnel → `tools push` → `agent:webhook`,
  new secret → restart dev; caveats 10, 26).
- If the live handoff misbehaves, diagnose via `GET /v1/convai/conversations/{id}` →
  `metadata.termination_reason` (caveats 27–29).
- Keep the test-first discipline + mid-level logging in any new path.
