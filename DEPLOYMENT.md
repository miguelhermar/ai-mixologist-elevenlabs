# Deploying Last Call to production

This is the runbook that took the app from the local cloudflared-tunnel setup to a
stable, free, public deployment on **Vercel** (Next.js host) + **Upstash Redis**
(durable storage). After it, the per-session tunnel dance is gone: the server tools
and the post-call webhook get a permanent HTTPS URL.

> ## ✅ Status: LIVE (deployed 2026-06-01)
> **Production URL: <https://ai-mixologist-elevenlabs.vercel.app>**
> - Vercel project `ai-mixologist-elevenlabs` (scope *Miguel Angel Hernandez's projects*),
>   imported from GitHub `miguelhermar/ai-mixologist-elevenlabs` → **auto-deploys on every push to `main`**.
> - Upstash store `upstash-kv-charcoal-apple` connected; favorites + call summaries persist there.
> - Verified live end-to-end (golden path + Sommelier transfer + post-call analytics +
>   a real favorite written to and read back from Redis).
>
> The steps below are kept as a reproducible runbook (re-deploying, a fresh environment,
> or a custom domain). Steps already executed are marked **[done]**.

> Target: a personal/demo deployment. Vercel's free **Hobby** tier is for
> non-commercial use; that's the assumption here.

---

## Why these pieces

- **Vercel** runs Next.js natively, globally, with always-on functions on the free
  tier — no cold-start sleep.
- **Upstash Redis** replaces the local `.data/*.json` files. A serverless host has a
  **read-only filesystem**, so favorites + call summaries must live in a managed
  store. The code auto-detects Upstash via env vars; with none set it falls back to
  the file store (local dev / tests). See [lib/kv.ts](lib/kv.ts).

## Production hardening already in the code

- **`/api/signed-url`** (spends ElevenLabs quota, no login) is guarded by a
  **same-origin check** ([lib/originGuard.ts](lib/originGuard.ts)) + a **per-IP rate
  limit** ([lib/ratelimit.ts](lib/ratelimit.ts), Upstash-backed). Foreign origin →
  403; too many sessions from one IP → 429.
- **`/summary` + `/api/summaries`** (expose guests' recaps + taste profiles) sit
  behind **HTTP Basic Auth** ([proxy.ts](proxy.ts)) keyed on `SUMMARY_USER` /
  `SUMMARY_PASSWORD`. Unset → allowed in dev, **blocked (503) in production**.

---

## One-time setup

> The whole flow can be driven from the **Vercel CLI** (`npx vercel …`) once you've run
> `npx vercel login`. The only steps that must happen in the Vercel **dashboard** are the
> Git import (step 2) and connecting the Upstash store to the project (step 3) — Vercel's
> CLI does not expose a "connect an existing Marketplace resource to a project" command.

### 1. Push the code to GitHub **[done]**
```bash
git init && git add -A && git commit -m "Last Call"
git remote add origin git@github.com:<you>/last-call.git
git push -u origin main
```
`.env*` and `.data/` are gitignored, so no secrets/data are committed.

### 2. Create the Vercel project (dashboard Git import) **[done]**
- Import the GitHub repo at <https://vercel.com/new> (framework auto-detected: Next.js).
- This links the repo so **every push to `main` auto-deploys**. The first deploy runs
  before env vars exist — that's fine, the Next.js *build* doesn't need the runtime
  secrets; we add them next and redeploy.
- Link your local checkout so the CLI can manage env + deploys:
  ```bash
  npx vercel login
  npx vercel link        # pick the imported project
  ```

### 3. Add + connect Upstash Redis (free) **[done]**
- In the Vercel project → **Storage** → **Connect Database/Store** → choose the existing
  Upstash store (or add one from the Marketplace) → connect it to the project for
  **all** environments.
- ⚠️ **Naming gotcha (important):** the Vercel Marketplace Upstash integration injects the
  credentials as **`KV_REST_API_URL` / `KV_REST_API_TOKEN`** (Vercel-KV naming), *not*
  `UPSTASH_REDIS_REST_URL` / `_TOKEN`. [lib/kv.ts](lib/kv.ts) accepts **either** naming, so
  storage works out of the box — but if you ever wire Redis by hand, set one of those pairs.

### 4. Set environment variables
The fastest way is the CLI (reads each value from stdin, encrypted at rest):
```bash
printf '%s' "$XI_API_KEY"          | npx vercel env add XI_API_KEY production
printf '%s' "$AGENT_ID"            | npx vercel env add AGENT_ID production
printf '%s' "1"                    | npx vercel env add COCKTAILDB_KEY production
printf '%s' "$TOOL_SHARED_SECRET"  | npx vercel env add TOOL_SHARED_SECRET production
printf '%s' "<analytics user>"     | npx vercel env add SUMMARY_USER production
printf '%s' "<analytics password>" | npx vercel env add SUMMARY_PASSWORD production
```
(Or paste them in Project → Settings → Environment Variables.)

| Variable | Value |
|---|---|
| `XI_API_KEY` | your unrestricted ElevenLabs key |
| `AGENT_ID` | `agent_1301kswshvrjfaz954ft54a2z0n3` (Last Call) |
| `COCKTAILDB_KEY` | `1` (free tier) |
| `TOOL_SHARED_SECRET` | the same value as the ElevenLabs workspace secret used by `save_favorite` |
| `SUMMARY_USER` / `SUMMARY_PASSWORD` | any user/password you choose for the analytics page |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | (added automatically in step 3) |

Leave `PUBLIC_BASE_URL` and `POSTCALL_WEBHOOK_SECRET` for now — they need the domain
from the first deploy (steps 5–6).

### 5. Deploy + capture the production domain **[done]**
```bash
npx vercel --prod        # prints the production deployment; the stable alias is the project domain
```
Note the production domain, e.g. `https://ai-mixologist-elevenlabs.vercel.app`, then:
```bash
printf '%s' "https://ai-mixologist-elevenlabs.vercel.app" | npx vercel env add PUBLIC_BASE_URL production
```

### 6. Point the ElevenLabs agent at the production URL **[done]**
Run locally (the CLI + scripts run against the live ElevenLabs workspace). **The
ElevenLabs CLI reads `ELEVENLABS_API_KEY` from the environment — it does *not* read
`.env.local`** — so export it first:
```bash
export ELEVENLABS_API_KEY=$(grep '^XI_API_KEY=' .env.local | cut -d= -f2-)

# repoint the 6 webhook tool URLs to the prod domain + push them live
PUBLIC_BASE_URL=https://ai-mixologist-elevenlabs.vercel.app npm run tools:repoint

# (re)deploy the agent config so everything is consistent
npm run agent:push

# register the post-call webhook against the prod URL; this prints + saves a secret
node scripts/register-postcall-webhook.mjs --url https://ai-mixologist-elevenlabs.vercel.app/api/post-call
```
- Copy the `POSTCALL_WEBHOOK_SECRET` the script reports into Vercel env, then **redeploy**
  so it loads:
  ```bash
  printf '%s' "<secret from the script>" | npx vercel env add POSTCALL_WEBHOOK_SECRET production
  npx vercel --prod
  ```
- Confirm the ElevenLabs **workspace secret** for `save_favorite` still matches
  `TOOL_SHARED_SECRET`.

> Env-var changes only take effect on the **next** deploy — always redeploy (`npx vercel --prod`,
> or push a commit) after adding/changing one.

---

## Verify the live deployment
1. Open the production URL, click "Step up to the bar", run the golden path: ask for
   a drink, show the recipe card, start a timer, add to the shopping list, save a
   favorite, switch to Spanish, ask a wine question (Sommelier transfer), then end the
   call.
2. **Persistence:** the saved favorite + the post-call summary survive a **redeploy**
   (they're in Upstash, not the filesystem). Check the Upstash console or
   `GET /api/summaries` (with the Basic Auth creds).
3. **Analytics is private:** visiting `/summary` prompts for the password.
4. **Quota guard:** rapid repeated `GET /api/signed-url` eventually returns **429**; a
   cross-origin `fetch` of it returns **403**.
5. The definitive check (as in prior phases): read the conversation transcript via
   `GET /v1/convai/conversations/{id}` to confirm tool calls + `termination_reason`.

A quick non-voice smoke (no browser needed):
```bash
BASE=https://ai-mixologist-elevenlabs.vercel.app
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/cocktails/random          # 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/summary                       # 401 (private in prod)
curl -s -o /dev/null -w '%{http_code}\n' -u user:pass $BASE/api/summaries    # 200 with creds
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/post-call -d '{}' # 401 (unsigned)
```

## Operational notes
- **Quota:** every visitor shares your ElevenLabs monthly quota (creator tier
  ~121k chars / ~275 min). The rate limit stops abuse, but genuine popularity can
  still exhaust it; calls then fail until the monthly reset (or a plan bump). Diagnose
  any failed call via `GET /v1/convai/conversations/{id}` → `metadata.termination_reason`.
- **Watching production logs:** `npx vercel logs <deployment-url> --follow --expand`
  streams live runtime logs (auto-disconnects after ~5 min — just re-run it).
- **Re-running the webhook script** mints a NEW webhook each time — delete stale ones
  in the ElevenLabs dashboard (Settings → Webhooks) or via
  `DELETE /v1/workspace/webhooks/{id}`.
- **Custom domain:** add it in Vercel, update `PUBLIC_BASE_URL`, then re-run step 6.
