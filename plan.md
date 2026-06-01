# Plan — "Last Call": AI Mixologist & Bar Concierge (ElevenLabs Agent)

## Context

The goal is to build a small-but-complete ElevenLabs **Agents** voice agent that is both
entertaining and genuinely useful, while deliberately exercising as many of the platform's
features as possible to demonstrate breadth of expertise.

After researching the ElevenLabs Agents platform (ASR → selectable LLM → low-latency TTS +
turn-taking, plus server/client/system tools, knowledge-base RAG, dynamic variables, workflows,
config-as-code CLI, and post-call webhooks) and confirming direction with the user, we are
building **"Last Call"** — a voice bar concierge that recommends cocktails by mood / by what you
have on hand, then walks you through making them hands-free.

**Confirmed decisions (from the user):**
- **Concept:** "Last Call" — AI Mixologist & Bar Concierge
- **Surface:** Web widget via the React Agents SDK (no telephony in scope)
- **Stack:** Next.js + TypeScript (App Router); API routes serve the server-tool webhooks
- **Integrations:** Real free/public APIs where possible (TheCocktailDB, key `"1"` for dev)

**Outcome:** A locally-runnable Next.js app with an embedded voice widget. You speak to the
concierge; it fetches real recipes, drives live on-screen UI (recipe card, timers, shopping
list, ambiance), answers technique questions from a RAG knowledge base, personalizes via dynamic
variables, and emits structured post-call analytics. The agent itself is defined as
version-controlled config via the `convai` CLI.

---

## Feature-coverage matrix (what proves breadth)

| Platform feature | How "Last Call" uses it |
|---|---|
| **Server tools** (webhooks) | `search_cocktail_by_name`, `find_cocktails_by_ingredient`, `get_cocktail_details`, `random_cocktail`, `suggest_by_mood`, `save_favorite` (POST + Bearer auth) |
| **Client tools** (browser) | `show_recipe_card`, `start_timer`, `add_to_shopping_list`, `set_ambiance`, `get_shopping_list` (uses **wait-for-response** for two-way data) |
| **System tools** | `language_detection`, `end_call`, `skip_turn` |
| **Knowledge base / RAG** | "Bartending 101" doc (techniques, glossary, substitutions, measures, zero-proof swaps); **source attribution** on |
| **Dynamic variables** | `user_name`, `taste_profile`, `abv_mode`, `available_spirits` from a pre-call form |
| **Config-as-code** | Agent defined in `convai/agent_configs/prod/last_call.json`, synced via `convai` CLI |
| **Post-call webhook** | `evaluation_criteria` + `data_collection` (favorite drink, abv_mode, made_a_drink) with HMAC verify |
| **Voice / LLM / multilingual** | Expressive voice, capable LLM (e.g. Claude Sonnet / GPT-class), language switching |
| **Multi-agent (stretch)** | "Sommelier" sub-agent via `agent_transfer` with a distinct voice for wine pairings |

---

## Architecture

```
Browser (Next.js page + widget)            ElevenLabs Agents (cloud)
  ├─ PreCallForm → dynamicVariables ─────▶  Agent (system prompt, voice, LLM)
  ├─ @elevenlabs/react ConversationProvider   │  ├─ system tools (lang/end/skip)
  │    └─ clientTools (run in browser) ◀──────┤  ├─ client tools (call browser)
  └─ UI: RecipeCard / Timer / ShoppingList    │  └─ server tools ─┐
                                              │  KB / RAG (uploaded doc)
  Next.js API routes (server)  ◀──────────────┘ (server tools + post-call hit these)
   ├─ /api/signed-url        → mints signed URL with XI_API_KEY
   ├─ /api/cocktails/*       → proxy + reshape TheCocktailDB
   ├─ /api/favorites (POST)  → Bearer-auth write
   └─ /api/post-call         → HMAC-verified analytics sink
```

Two reasons server tools proxy through our `/api/cocktails/*` rather than hitting TheCocktailDB
directly: (1) reshape/trim responses to just what the LLM needs (lower tokens, cleaner answers),
and (2) `suggest_by_mood` adds real server-side logic (mood → ingredient mapping). Server tools
are called by ElevenLabs' servers, so for local dev these routes must be reachable via a tunnel
(see Verification).

---

## Project structure

```
last-call/
  app/
    page.tsx                      # landing + PreCallForm + widget mount
    layout.tsx
    api/
      signed-url/route.ts         # GET → signed URL (server-side XI_API_KEY)
      cocktails/
        search/route.ts           # ?name=   → search.php?s=
        by-ingredient/route.ts    # ?ingredient= → filter.php?i=
        [id]/route.ts             # lookup.php?i={id}
        random/route.ts           # random.php
        by-mood/route.ts          # mood → ingredient set → filtered picks
      favorites/route.ts          # POST save_favorite (Bearer TOOL_SHARED_SECRET)
      post-call/route.ts          # post-call webhook (HMAC verify)
  components/
    BarConcierge.tsx              # ConversationProvider + start/end + clientTools
    PreCallForm.tsx               # collects dynamic variables
    RecipeCard.tsx  ShoppingList.tsx  Timer.tsx  Ambiance.tsx
  lib/
    clientTools.ts                # client-tool fns wired to a small UI store (zustand/context)
    cocktaildb.ts                 # fetch + shape helpers
    elevenlabs.ts                 # signed-url helper
  convai/
    agents.json                   # CLI registry
    agent_configs/prod/last_call.json
    knowledge-base/bartending-101.md
  .env.example
  README.md
```

---

## Agent configuration (in `last_call.json`, synced via CLI)

- **First message:** "Welcome to Last Call — I'm your bar concierge. Tell me what you're in the
  mood for, or what bottles you've got, and I'll mix you up something good."
- **System prompt** (key points): persona = warm, witty speakeasy bartender; greet by
  `{{user_name}}`; respect `{{abv_mode}}` (regular / low-ABV / zero-proof) and
  `{{taste_profile}}`; prefer `{{available_spirits}}`; when recommending, **call
  `show_recipe_card`** so the user sees it; offer to **start a timer** for shake/steep/chill
  steps; offer to **add missing items** to the shopping list; use the knowledge base for
  technique/substitution questions and cite sources; keep turns short and spoken-friendly; use
  `skip_turn` while the user measures/pours; `end_call` warmly when they're done.
- **Voice / LLM:** expressive voice; capable tool-using LLM (Claude Sonnet or GPT-class).
- **Tools:** register all server/client/system tools below (client-tool names + params must
  match the SDK definitions exactly).
- **Knowledge base:** attach `bartending-101` (usage_mode `auto`); enable source attribution.

### Server tools (point at deployed/tunneled base URL)
| Tool | Method | Route | Params |
|---|---|---|---|
| `search_cocktail_by_name` | GET | `/api/cocktails/search` | `name` |
| `find_cocktails_by_ingredient` | GET | `/api/cocktails/by-ingredient` | `ingredient` |
| `get_cocktail_details` | GET | `/api/cocktails/{id}` | path `id` |
| `random_cocktail` | GET | `/api/cocktails/random` | — |
| `suggest_by_mood` | GET | `/api/cocktails/by-mood` | `mood`, `abv_mode` |
| `save_favorite` | POST | `/api/favorites` | body `name`,`id`; header `Authorization: Bearer …` |

### Client tools (defined in `BarConcierge.tsx` `clientTools`)
| Tool | Params | Effect | Wait for response |
|---|---|---|---|
| `show_recipe_card` | `id,name,ingredients[],steps[],glass,image` | renders card | no |
| `start_timer` | `seconds,label` | visible countdown | no |
| `add_to_shopping_list` | `items[]` | appends to list | no |
| `set_ambiance` | `mode` (`speakeasy`/`tiki`/`bright`) | theme/lighting | no |
| `get_shopping_list` | — | returns current list to agent | **yes** |

### System tools
`language_detection`, `end_call`, `skip_turn`.

### Dynamic variables (passed at `startSession`)
`user_name`, `taste_profile`, `abv_mode`, `available_spirits` — collected by `PreCallForm`.

### Post-call (`/api/post-call`)
- `evaluation_criteria`: e.g. "user received a complete, makeable recipe."
- `data_collection`: `favorite_cocktail`, `taste_profile`, `abv_mode`, `made_a_drink` (bool).
- Verify HMAC signature, return 200, persist to a local JSON/log and render a session summary.

---

## Key APIs to reuse (don't reinvent)

- **`@elevenlabs/react`** — `ConversationProvider`, `useConversationControls` (`startSession`/
  `endSession`), `useConversationStatus`. `startSession({ signedUrl, connectionType,
  dynamicVariables, clientTools, onConnect, onDisconnect, onMessage, onError })`. Client tools
  are plain functions whose names/params mirror the agent config.
- **Signed URL** — `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…`
  with header `xi-api-key` (server-side only).
- **TheCocktailDB** (key `"1"` for dev): `search.php?s=`, `filter.php?i=`, `lookup.php?i=`,
  `random.php`, `list.php?i=list`.
- **`@elevenlabs/convai-cli`** — `convai init` → `convai login` → `convai add "Last Call"` →
  edit `agent_configs/prod/last_call.json` → `convai sync` (`convai watch` during dev). Commit
  `agents.json` + configs; gitignore `convai.lock`.

---

## Build steps

1. **Scaffold** Next.js (TS, App Router, Tailwind). Install `@elevenlabs/react`,
   `@elevenlabs/convai-cli`, a tiny state lib (zustand or React context). Add `.env.example`.
2. **Signed URL + bare widget** — `/api/signed-url` route; `BarConcierge` connects/disconnects.
   Verify a basic voice round-trip against a stub agent.
3. **Agent as code** — `convai init`/`add`; author system prompt, first message, voice, LLM,
   language; `convai sync`. Confirm the synced agent answers.
4. **Server tools** — build `/api/cocktails/*` proxy + reshape helpers in `lib/cocktaildb.ts`;
   add `suggest_by_mood` mapping; register the 6 server tools in config. Verify the agent fetches
   a real recipe by name and by ingredient.
5. **Client tools** — implement the 5 client tools + UI components (RecipeCard, Timer,
   ShoppingList, Ambiance); register in `clientTools` and in agent config (exact name/param
   match). Verify the screen reacts to speech, including `get_shopping_list` returning data.
6. **System tools** — enable `language_detection`, `end_call`, `skip_turn`; verify language
   switch and graceful hangup.
7. **Knowledge base** — author `bartending-101.md`; upload + attach (usage_mode `auto`); enable
   source attribution. Verify grounded technique/substitution answers with citations.
8. **Dynamic variables** — `PreCallForm` → `startSession({ dynamicVariables })`; reference
   `{{…}}` in the prompt. Verify personalization (name, abv_mode, available_spirits).
9. **Post-call webhook** — configure evaluation criteria + data collection; implement
   `/api/post-call` (HMAC verify, persist, summary). Verify payload after a call.
10. **(Stretch) Sommelier sub-agent** — second agent (distinct voice) + `agent_transfer` for
    wine pairing.
11. **Polish** — README (setup, env, run, demo script), `.env.example`, brief architecture note.

---

## Verification (end-to-end)

- **Run:** `npm run dev`; expose locally with a tunnel (`cloudflared`/`ngrok`) and set the
  agent's server-tool base URL + post-call webhook URL to the tunnel — ElevenLabs' servers must
  reach these routes (the browser-side widget works on localhost regardless).
- **Smoke:** open the page, fill the pre-call form, grant mic, confirm connection via signed URL.
- **Golden path:** say *"I've got gin and lime, want something sour and low-ABV"* → agent calls
  `suggest_by_mood` / `find_cocktails_by_ingredient`, fires `show_recipe_card`, offers a
  `start_timer` for the shake, `add_to_shopping_list` for a missing item; ask *"shake or stir?"*
  → grounded KB answer with citation; *"save this one"* → `save_favorite` (Bearer) 200; end the
  call → `end_call`.
- **Analytics:** confirm `/api/post-call` receives a valid HMAC payload with populated
  `data_collection_results`.
- **Config-as-code:** edit the prompt locally, `convai sync`, confirm the new agent version is
  live (and visible in agent versioning).

---

## Prerequisites / env

- ElevenLabs account + API key (free tier includes limited Agents minutes).
- `.env.local`: `XI_API_KEY`, `AGENT_ID`, `TOOL_SHARED_SECRET`, `POSTCALL_WEBHOOK_SECRET`,
  `COCKTAILDB_KEY=1`.
- A tunnel tool for local server-tool/webhook reachability.

## Out of scope (this iteration)

Telephony (Twilio/DTMF/voicemail/human-transfer), MCP integrations, batch outbound calling,
production TheCocktailDB key. The Sommelier sub-agent is a stretch goal, not required for a
complete demo.
