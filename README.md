# Last Call — AI Mixologist & Bar Concierge

A voice bar concierge built on the **ElevenLabs Agents** platform. You speak to it
in the browser; it recommends cocktails by mood or by what you have on hand, walks
you through making them hands-free with live on-screen UI (recipe card, timers,
shopping list, ambiance), answers technique questions from a bartending knowledge
base, personalizes from an optional pre-call form, emits HMAC-verified post-call
analytics you can review on a `/summary` page, and — for wine — hands you off to a
**second agent, the Sommelier**, with a distinct voice and its own wine knowledge base.

Built in **phases 1–6, all complete and live voice-verified** end-to-end — including the
Phase 6 Sommelier sub-agent and its bidirectional agent transfer. See
[the full plan](./plan.md) and [Roadmap](#roadmap) below.

> ### 🚀 Live in production
> **<https://ai-mixologist-elevenlabs.vercel.app>** — deployed on **Vercel** with **Upstash
> Redis** for durable storage. Pushes to `main` auto-deploy. The same code runs locally
> (file-backed stores, no auth); production hardening switches on purely from env vars.
> See [DEPLOYMENT.md](DEPLOYMENT.md).

### Documentation
- **[USER-GUIDE.md](USER-GUIDE.md)** — brief, friendly guide for people *using* the app.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how it's wired + workflow diagrams (what happens on each interaction).
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — production deploy runbook (Vercel + Upstash) + the hardening it switches on.
- **[HANDOFF.md](HANDOFF.md)** — session handoff / build log: decisions, caveats, and how to continue (all six phases are built + live voice-verified).
- **[plan.md](plan.md)** — the full multi-phase plan.

## Phase 1 — what works today ✅

A locally-runnable Next.js app with an embedded voice widget that does a clean
voice round-trip against a live, version-controlled ElevenLabs agent:

- **Landing page + widget** ([`app/page.tsx`](app/page.tsx),
  [`components/BarConcierge.tsx`](components/BarConcierge.tsx)) — "Step up to the
  bar" connects; "Close the tab" disconnects; live status + error handling.
- **Signed-URL minting** ([`app/api/signed-url/route.ts`](app/api/signed-url/route.ts),
  [`lib/elevenlabs.ts`](lib/elevenlabs.ts)) — the API key stays server-side; the
  browser only ever receives a short-lived signed WebSocket URL.
- **Agent as code** ([`agent_configs/Last-Call.json`](agent_configs/Last-Call.json))
  — the bartender persona, first message, LLM, and voice are defined as config and
  pushed via the ElevenLabs CLI.
- **Tests** — unit (signed-url helper), integration (the API route), and component
  (the widget) tests, all runnable with `npm test`.

## Phase 2 — server tools (live cocktail data) ✅

The agent now fetches **real recipes** through 6 server (webhook) tools backed by our
own Next.js routes that proxy + trim [TheCocktailDB](https://www.thecocktaildb.com/api.php):

- **Cocktail proxy** ([`lib/cocktaildb.ts`](lib/cocktaildb.ts) + [`app/api/cocktails/*`](app/api/cocktails))
  — search by name, find by ingredient, full details by id, a random drink, and
  `suggest_by_mood` (a curated mood→ingredient map filtered by ABV preference). Verbose
  upstream payloads are reshaped to the minimum the LLM needs.
- **Save favorites** ([`app/api/favorites/route.ts`](app/api/favorites/route.ts)) — a
  Bearer-authed POST that appends to a local JSON store ([`lib/favorites.ts`](lib/favorites.ts)).
- **Tools as code** ([`tool_configs/*.json`](tool_configs) + [`tools.json`](tools.json))
  — the 6 webhook tools are version-controlled and pushed via the CLI, then attached to
  the agent through `prompt.tool_ids`.

> **Server tools are called by ElevenLabs' cloud, not the browser** — so the routes must
> be reachable at a public URL. In dev we expose `localhost:3000` with a
> [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
> quick tunnel and point the tool URLs at it (see [Server tools](#server-tools-phase-2)).

## Phase 3 — client tools + live on-screen UI ✅

The agent now **drives the screen** through 5 client (browser) tools, laid out as a
two-column **bar dashboard** (voice widget on the left, live panels on the right):

- **Bar store** ([`lib/store.ts`](lib/store.ts)) — a small **zustand** store holding the
  current recipe, timers, shopping list, and ambiance. The shopping list + ambiance
  **persist to localStorage**; the recipe and timers are session-only.
- **Client tools** ([`lib/clientTools.ts`](lib/clientTools.ts)) — `show_recipe_card`,
  `start_timer`, `add_to_shopping_list`, `set_ambiance`, and `get_shopping_list` (the one
  that **returns** the list to the agent). `show_recipe_card` fetches the canonical recipe
  from [`/api/cocktails/{id}`](app/api/cocktails/[id]/route.ts) so the card is always
  accurate. Registered via `startSession({ clientTools })`.
- **Panels** ([`Dashboard`](components/Dashboard.tsx), [`RecipeCard`](components/RecipeCard.tsx),
  [`TimerStack`](components/TimerStack.tsx), [`ShoppingList`](components/ShoppingList.tsx))
  react to the store; ambiance ([`lib/ambiance.ts`](lib/ambiance.ts)) themes the page
  (`speakeasy` / `tiki` / `bright`), switchable by voice **or** the header
  [`ThemeSwitcher`](components/ThemeSwitcher.tsx). Finished timers ring a synthesized
  **bell** ([`lib/sound.ts`](lib/sound.ts), Web Audio — no asset).

> **Client tools run in the browser** — no tunnel needed for them. Say e.g. *"make up a
> quick gin sour and show me the card"* and the card/ambiance react live. For the full
> golden path (agent fetches a real drink first), keep the Phase 2 server-tool tunnel up.

## Phase 4 — system tools, knowledge base (RAG) & personalization ✅

The agent now manages the call itself, grounds technique answers in a real reference,
and personalizes from an optional pre-call form:

- **System tools** — `end_call`, `language_detection`, and `skip_turn`, enabled inline
  on the agent (`prompt.built_in_tools`). The agent ends the call warmly when you're done,
  waits quietly while you measure or pour, and **switches language** mid-conversation
  (Spanish is enabled; English stays the default with `eleven_flash_v2`).
- **Knowledge base + RAG** ([`knowledge-base/bartending-101.md`](knowledge-base/bartending-101.md))
  — a house bartending guide (techniques, glassware, measures, glossary, substitutions,
  zero-proof swaps), uploaded + RAG-indexed via the ElevenLabs REST API and attached with
  `usage_mode: "auto"`. **Source attribution** is on, so the agent tells you when it's
  drawing on the guide. Ask "shake or stir a Negroni?" or "what can I use instead of simple syrup?"
- **Dynamic variables** ([`components/PreCallForm.tsx`](components/PreCallForm.tsx),
  [`lib/personalization.ts`](lib/personalization.ts)) — an **optional** pre-call form
  collects your name, taste profile, ABV preference, and the spirits you have on hand, passed
  via `startSession({ dynamicVariables })` and referenced as `{{user_name}}` etc. in the prompt.
  Skip it (or leave fields blank) and the client sends sensible defaults (`friend`, etc.) for
  each — every referenced `{{var}}` always gets a concrete runtime value.

> **Deploying agent edits:** use `npm run agent:push` (not the bare CLI). The CLI 0.5.3
> `agents push` silently drops `dynamic_variable_placeholders`, so the wrapper re-applies
> them via the REST API afterward ([`scripts/apply-agent-placeholders.mjs`](scripts/apply-agent-placeholders.mjs)).
> Knowledge-base docs are created/indexed through the REST API too (the CLI has no KB commands).

## Phase 5 — post-call webhook & analytics ✅

When a conversation ends, ElevenLabs' cloud sends a **signed** transcription payload to
our webhook; we verify it, distill it, and show it back to you:

- **Webhook sink** ([`app/api/post-call/route.ts`](app/api/post-call/route.ts),
  [`lib/postcall.ts`](lib/postcall.ts)) — verifies the **HMAC** signature
  (`ElevenLabs-Signature`, `t=…,v0=…`, HMAC-SHA256 over `` `${timestamp}.${rawBody}` ``,
  30-min replay window) against `POSTCALL_WEBHOOK_SECRET`, then reshapes the analysis and
  returns 200 quickly. Bad signatures get a generic 401.
- **Analytics on the agent** — `platform_settings.evaluation.criteria`
  (`complete_recipe`, `responsible_service`) and `platform_settings.data_collection`
  (`favorite_cocktail`, `taste_profile`, `abv_mode`, `made_a_drink`) tell ElevenLabs what
  to judge + extract from each transcript.
- **Summaries** ([`/summary`](app/summary/page.tsx),
  [`lib/callSummaries.ts`](lib/callSummaries.ts)) — each call's AI recap, success verdict,
  extracted data, and pass/fail criteria, persisted to a local JSON store (upsert by
  conversation id) and rendered on a dedicated page (linked from the dashboard footer).

> **Register the webhook with `npm run agent:webhook`.** Workspace webhooks are REST-API
> only (the CLI has none); the script creates the HMAC webhook, writes
> `POSTCALL_WEBHOOK_SECRET` into `.env.local`, and links it to the agent. Like the server
> tools, the webhook is a **public URL** — keep the cloudflared tunnel up, and re-register
> after a tunnel restart (it mints a fresh secret, so restart `npm run dev` afterward).

## Phase 6 — Sommelier sub-agent & agent transfer ✅

For wine, Last Call hands you off to a **second agent** — and hands you back when you
return to cocktails. The transfer happens **server-side inside the same call**, so you
keep the same widget; only the voice and persona switch.

- **The Sommelier** ([`agent_configs/Sommelier.json`](agent_configs/Sommelier.json)) — a
  distinct **voice (Lily, British)**, a warm non-snobby wine-expert persona, and its own
  **wine knowledge base** ([`knowledge-base/wine-pairing-101.md`](knowledge-base/wine-pairing-101.md),
  RAG-indexed, source attribution) so it cites the "house cellar notes."
- **Bidirectional transfer** — each agent declares a `transfer_to_agent` system tool in
  `prompt.built_in_tools`: Last Call → Sommelier on wine questions (the Sommelier greets in
  its own voice on arrival); Sommelier → Last Call on cocktail/spirit questions. The
  Sommelier reads the **preserved transcript** to keep your name and taste in mind — it
  references no dynamic variables, so the handoff can't fail on a missing one.
- **Reusable KB script** ([`scripts/upload-knowledge-base.mjs`](scripts/upload-knowledge-base.mjs))
  — `node scripts/upload-knowledge-base.mjs <file> <name>` uploads + RAG-indexes a doc.

> The Sommelier is reached **only via transfer** (no separate page). Try *"what wine goes
> with steak?"* to meet it, then *"actually, make me a cocktail"* to hand back. The
> transfer itself needs **no tunnel** (it's cloud-side between two agents).

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **[`@elevenlabs/react`](https://www.npmjs.com/package/@elevenlabs/react)** — the
  voice widget (`ConversationProvider`, `useConversationControls`, `useConversationStatus`)
- **[`@elevenlabs/cli`](https://www.npmjs.com/package/@elevenlabs/cli)** — agents as code
- **Vitest** + **Testing Library** — unit / integration / component tests
- **zustand** — the Phase 3 client-tool UI store ([`lib/store.ts`](lib/store.ts), with
  `persist` for the shopping list + ambiance)

## Prerequisites

- Node.js 20+ (built and tested on Node 22)
- An ElevenLabs account + an **unrestricted** API key (free tier includes limited
  Agents minutes, which is enough for development)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
#   then set XI_API_KEY (your sk_... key). AGENT_ID is filled in by the push step.
#   Phase 2 also uses: COCKTAILDB_KEY=1, a generated TOOL_SHARED_SECRET, and
#   PUBLIC_BASE_URL (the cloudflared tunnel URL — see "Server tools" below).

# 3. (First time only) provision the agent on ElevenLabs from local config.
#    The CLI reads ELEVENLABS_API_KEY, or run `npx elevenlabs auth login` first.
ELEVENLABS_API_KEY=$XI_API_KEY npx elevenlabs agents push
#   Copy the printed agent id into AGENT_ID in .env.local (or run `npm run agent:status`).
```

> The "Last Call" agent already exists in this workspace
> (`agent_1301kswshvrjfaz954ft54a2z0n3`) and `.env.local` is pre-wired. The push
> step above is only needed when recreating the agent or after editing its config.

## Run

```bash
npm run dev      # http://localhost:3000
```

Open the page → click **Step up to the bar** → grant microphone access → say hello.
The status line reflects the connection state; errors surface inline.

## Test

```bash
npm test         # run the full Vitest suite once
npm run test:watch
```

Coverage (**202 tests**, 36 files):

| File | Kind | What it checks |
|---|---|---|
| [`lib/elevenlabs.test.ts`](lib/elevenlabs.test.ts) | unit | signed-url helper: success, encoding, missing config, upstream errors |
| [`app/api/signed-url/route.test.ts`](app/api/signed-url/route.test.ts) | integration | the route returns 200/signed URL, mirrors upstream status, never leaks internals |
| [`components/BarConcierge.test.tsx`](components/BarConcierge.test.tsx) | component | connect flow calls `startSession` with a websocket signed URL; error + connected states |
| [`lib/cocktaildb.test.ts`](lib/cocktaildb.test.ts) | unit | reshapers (ingredient zip, drinks:null), `suggestByMood` mood-map + ABV filtering + fallback, error mapping |
| [`lib/favorites.test.ts`](lib/favorites.test.ts) | unit | local store: safe init, create-on-write, append round-trip |
| [`app/api/cocktails/*/route.test.ts`](app/api/cocktails) | integration | each cocktail route: success shape, not-found/empty, generic error on upstream failure |
| [`app/api/favorites/route.test.ts`](app/api/favorites/route.test.ts) | integration | Bearer auth: 401 without/with wrong token, 400 on bad body, 200 + persists |
| [`lib/store.test.ts`](lib/store.test.ts) | unit | bar store actions + de-dupe + what does/doesn't persist to localStorage |
| [`lib/clientTools.test.ts`](lib/clientTools.test.ts) | unit | the 5 client tools: fetch-by-id + fallback, timer/list/ambiance, `get_shopping_list` return |
| [`lib/ambiance.test.ts`](lib/ambiance.test.ts) | unit | theme map covers every mode + fallback |
| [`components/RecipeCard.test.tsx`](components/RecipeCard.test.tsx) | component | empty state, renders recipe/ingredients/steps, dismiss; `deriveSteps` |
| [`components/TimerStack.test.tsx`](components/TimerStack.test.tsx) | component | active vs done timers; `formatRemaining` |
| [`components/ShoppingList.test.tsx`](components/ShoppingList.test.tsx) | component | empty, list with count, remove one, clear all |
| [`components/Dashboard.test.tsx`](components/Dashboard.test.tsx) | component | two-column layout, ambiance badge after hydration, renders a pushed recipe |
| [`lib/sound.test.ts`](lib/sound.test.ts) | unit | the timer bell: no-throw without Web Audio, builds the chime + resumes the context |
| [`components/ThemeSwitcher.test.tsx`](components/ThemeSwitcher.test.tsx) | component | shows all 3 moods, highlights current, switches on click, reflects voice-driven changes |
| [`lib/personalization.test.ts`](lib/personalization.test.ts) | unit | `mergeSpirits` (dedupe/trim/join), `buildDynamicVariables` (fills blanks with defaults, primitives only) |
| [`components/PreCallForm.test.tsx`](components/PreCallForm.test.tsx) | component | renders 4 inputs, emits onChange, ABV/spirit toggles, reflects value, disabled state |
| [`agent_configs/Last-Call.config.test.ts`](agent_configs/Last-Call.config.test.ts) | guard | Phase 4 + 5 + 6 wire shapes: `built_in_tools`, KB+RAG, `source_attribution`, `language_presets`, placeholder defaults, **evaluation criteria + data collection**, **`transfer_to_agent` → Sommelier** |
| [`agent_configs/Sommelier.config.test.ts`](agent_configs/Sommelier.config.test.ts) | guard | Phase 6 sub-agent: distinct Lily voice, no dynamic vars, wine KB + RAG + attribution, the three system tools, back-transfer → Last Call |
| [`lib/postcall.test.ts`](lib/postcall.test.ts) | unit | HMAC verify (valid/missing/bad-format/wrong-secret/tampered/expired) + payload parse + `toCallSummary` reshape |
| [`lib/callSummaries.test.ts`](lib/callSummaries.test.ts) | unit | summary store: safe init, create-on-write, upsert-by-conversation, newest-first |
| [`app/api/post-call/route.test.ts`](app/api/post-call/route.test.ts) | integration | 401 (missing/bad/tampered sig), 200 + persists valid event, ignores non-transcription, 400 on bad JSON |
| [`app/api/summaries/route.test.ts`](app/api/summaries/route.test.ts) | integration | lists persisted summaries; 500 on store failure |
| [`components/CallSummaryList.test.tsx`](components/CallSummaryList.test.tsx) | component | empty state, renders recap + data collection + eval verdicts; `formatDuration` |
| [`lib/kv.test.ts`](lib/kv.test.ts) | unit | Upstash client factory: not-configured → null, both env vars required, **accepts `KV_REST_API_*` or `UPSTASH_REDIS_REST_*` naming**, key prefix |
| [`lib/favorites.redis.test.ts`](lib/favorites.redis.test.ts) · [`lib/callSummaries.redis.test.ts`](lib/callSummaries.redis.test.ts) | unit | the Redis backend of each store (mocked client): read/upsert, newest-first |
| [`lib/originGuard.test.ts`](lib/originGuard.test.ts) | unit | same-origin guard: allow no-origin/matching, block foreign, PUBLIC_BASE_URL host |
| [`lib/ratelimit.test.ts`](lib/ratelimit.test.ts) | unit | no-op when Upstash absent; `clientIp` header parsing |
| [`proxy.test.ts`](proxy.test.ts) | unit | analytics Basic Auth: pass/challenge/wrong creds/bad base64, dev-allow vs prod-deny when unset |

## Production deployment

The app is built to run locally (file-backed stores, no auth) **and** as a hardened public
deployment. See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full Vercel + Upstash runbook. In
short, production adds three things, all gated purely on environment variables (so local dev
and tests are unchanged):

- **Durable storage** — once the Upstash REST credentials are set, the favorites +
  call-summary stores use Redis instead of `.data/*.json` (a serverless filesystem is
  read-only). The Vercel Marketplace Upstash integration injects them as
  `KV_REST_API_URL` / `KV_REST_API_TOKEN`; [`lib/kv.ts`](lib/kv.ts) accepts those **or**
  the `UPSTASH_REDIS_REST_URL` / `_TOKEN` pair.
- **Quota guard on `/api/signed-url`** — a same-origin check ([`lib/originGuard.ts`](lib/originGuard.ts))
  + per-IP rate limit ([`lib/ratelimit.ts`](lib/ratelimit.ts)) so the no-login, credit-spending
  endpoint can't be drained by a bot (403 foreign origin / 429 too many).
- **Private analytics** — `SUMMARY_USER` / `SUMMARY_PASSWORD` put `/summary` + `/api/summaries`
  behind HTTP Basic Auth ([`proxy.ts`](proxy.ts)); unset → allowed in dev, blocked in prod.

`npm run tools:repoint` rewrites the 6 webhook tool URLs from `PUBLIC_BASE_URL` and pushes
them — replacing the manual tunnel-URL edit once you're on a stable domain.

## Agent as code

The agent definition lives in version control and is synced with the CLI:

```bash
npm run agent:status                 # show local vs remote state + version id
ELEVENLABS_API_KEY=$XI_API_KEY \
  npm run agent:push                 # push edits + re-apply placeholders (see note)
ELEVENLABS_API_KEY=$XI_API_KEY \
  npx elevenlabs agents push --dry-run
```

Edit [`agent_configs/Last-Call.json`](agent_configs/Last-Call.json) (prompt, first
message, voice, LLM, temperature, tools, knowledge base), push, and the new version
goes live. `agents.json` registers the agent id + current version.

> **Use `npm run agent:push`, not the bare CLI.** CLI 0.5.3 `agents push` silently drops
> `dynamic_variable_placeholders` (it camelCases the map keys). The npm script runs the
> push and then re-applies the placeholders via the REST API
> ([`scripts/apply-agent-placeholders.mjs`](scripts/apply-agent-placeholders.mjs)) so the
> committed config stays the source of truth.

> **Multilingual note:** the agent keeps `eleven_flash_v2` + `language: "en"` as primary —
> English agents *reject* the multilingual `*_v2_5` models. Additional languages (Spanish)
> are registered via `conversation_config.language_presets`, and ElevenLabs auto-promotes to
> the multilingual model when `language_detection` switches the conversation.

## Server tools (Phase 2)

The agent's cocktail tools are HTTP webhooks ElevenLabs' cloud calls during a
conversation. Because they're called from the cloud, the routes need a **public URL**.

```bash
# 1. Run the app
npm run dev                                   # http://localhost:3000

# 2. Expose it (separate terminal). Copy the printed https://<name>.trycloudflare.com URL.
cloudflared tunnel --url http://localhost:3000

# 3. Point the tools at it and push
#    Set PUBLIC_BASE_URL in .env.local to the tunnel URL, then regenerate the tool
#    URLs in tool_configs/*.json to match and push:
ELEVENLABS_API_KEY=$XI_API_KEY npx elevenlabs tools push
ELEVENLABS_API_KEY=$XI_API_KEY npx elevenlabs agents push   # attaches tool_ids
```

| Tool | Method | Route | Params |
|---|---|---|---|
| `search_cocktail_by_name` | GET | `/api/cocktails/search` | `name` |
| `find_cocktails_by_ingredient` | GET | `/api/cocktails/by-ingredient` | `ingredient` |
| `get_cocktail_details` | GET | `/api/cocktails/{id}` | path `id` |
| `random_cocktail` | GET | `/api/cocktails/random` | — |
| `suggest_by_mood` | GET | `/api/cocktails/by-mood` | `mood`, `abv_mode` |
| `save_favorite` | POST | `/api/favorites` | body `name`,`id`; `Authorization: Bearer …` |

The `save_favorite` Bearer secret is **not** stored in the tool config — it lives in an
ElevenLabs workspace secret and the header references it by `secret_id`. The matching
value is `TOOL_SHARED_SECRET` in `.env.local`, which `/api/favorites` checks.

> **Quick-tunnel URLs change every run.** When the tunnel URL changes, update
> `PUBLIC_BASE_URL` + the `url` in each `tool_configs/*.json`, then re-run
> `elevenlabs tools push`. (A [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
> gives a stable URL if you want to avoid this.)

> **TheCocktailDB dev key caveat:** the free key `1` throttles the `filter.php`
> endpoints (`by-ingredient`, and the candidate lookups inside `by-mood`) to a single
> result per call. Search, details, and random return full data. A paid key removes the
> cap; the code handles sparse results gracefully.

## Architecture (Phase 1)

```
Browser (Next.js page + @elevenlabs/react widget)        ElevenLabs Agents (cloud)
  └─ BarConcierge ──GET /api/signed-url──▶ Next.js API ──get-signed-url (xi-api-key)──▶ Agent
       └────────── opens WSS via signed URL ───────────────────────────────────────────▶ (voice)
```

The API key is only ever read on the server (`process.env.XI_API_KEY`). The browser
receives a single-use signed URL and opens the voice WebSocket directly to ElevenLabs.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| **1** | Foundation: scaffold, signed URL, widget, agent-as-code, tests | ✅ done |
| **2** | Server tools: `/api/cocktails/*` proxy + 6 server tools (TheCocktailDB) | ✅ done |
| **3** | Client tools + UI: recipe card, timer, shopping list, ambiance | ✅ done |
| **4** | System tools, knowledge-base RAG, dynamic variables (pre-call form) | ✅ done |
| **5** | Post-call webhook + analytics (HMAC-verified) + `/summary` page | ✅ done |
| **6** | Sommelier sub-agent (Lily voice + wine KB/RAG) + bidirectional `transfer_to_agent` | ✅ done |
| **Prod** | Deploy hardening: Upstash storage, signed-url quota guard, analytics Basic Auth — [DEPLOYMENT.md](DEPLOYMENT.md) | ✅ done |

## Project layout

```
app/
  page.tsx                     # renders <Dashboard /> (Phase 3)
  layout.tsx                   # metadata + speakeasy theme
  api/
    signed-url/route.ts        # GET → signed URL (server-side key)
    cocktails/                 # Phase 2 server-tool routes (proxy + reshape)
      search/ by-ingredient/ [id]/ random/ by-mood/
    favorites/route.ts         # POST save_favorite (Bearer-authed)
    post-call/route.ts         # Phase 5 POST webhook sink (HMAC-verified → persist)
    summaries/route.ts         # Phase 5 GET list of persisted call summaries
  summary/page.tsx             # Phase 5 /summary analytics page (server component)
components/
  BarConcierge.tsx             # ConversationProvider + connect/disconnect + clientTools + dynamicVariables
  PreCallForm.tsx              # Phase 4 optional personalization form (dynamic variables)
  Dashboard.tsx                # Phase 3 two-column bar dashboard + ambiance theming (+ /summary link)
  RecipeCard.tsx TimerStack.tsx ShoppingList.tsx   # the live panels
  ThemeSwitcher.tsx            # header mood switcher (voice + click)
  CallSummaryList.tsx          # Phase 5 presentational summary cards
lib/
  elevenlabs.ts                # signed-url helper (testable, injectable fetch)
  cocktaildb.ts                # TheCocktailDB fetch + reshape + mood logic
  favorites.ts                 # local JSON favorites store
  store.ts                     # Phase 3 zustand bar store (persist: list + ambiance)
  clientTools.ts               # Phase 3 client-tool handlers (buildClientTools)
  ambiance.ts                  # speakeasy / tiki / bright theme map
  sound.ts                     # Web Audio timer-completion bell
  personalization.ts           # Phase 4 dynamic-variable builder + form types/options
  postcall.ts                  # Phase 5 HMAC verify + payload reshape (toCallSummary)
  callSummaries.ts             # Phase 5 local JSON summary store (upsert by conversation id)
knowledge-base/bartending-101.md  # Phase 4 RAG knowledge-base doc
knowledge-base/wine-pairing-101.md  # Phase 6 Sommelier RAG knowledge-base doc
scripts/apply-agent-placeholders.mjs   # Phase 4 post-push placeholder reconcile (CLI workaround)
scripts/register-postcall-webhook.mjs  # Phase 5 create HMAC webhook + link agent (npm run agent:webhook)
scripts/upload-knowledge-base.mjs      # Phase 6 reusable KB upload + RAG-index + poll
agent_configs/Last-Call.json   # the agent, as code (11 tools + 4 system tools incl. transfer_to_agent + KB + RAG + dyn vars + eval/data-collection)
agent_configs/Sommelier.json   # Phase 6 sub-agent (Lily voice + wine KB/RAG + transfer back)
tool_configs/*.json            # 6 webhook + 5 client tools, as code
agents.json / tools.json       # CLI registries (agent + tool ids)
plan.md                        # the full multi-phase plan
```
