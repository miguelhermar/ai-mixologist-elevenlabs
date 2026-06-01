# Deploying Last Call to production

This guide takes the app from the local cloudflared-tunnel setup to a stable,
free, public deployment on **Vercel** (Next.js host) + **Upstash Redis** (durable
storage). After this, the per-session tunnel dance is gone: the server tools and
post-call webhook get a permanent HTTPS URL.

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

### 1. Push the code to GitHub
```bash
git init && git add -A && git commit -m "Last Call"
# create an empty GitHub repo, then:
git remote add origin git@github.com:<you>/last-call.git
git push -u origin main
```
`.env*` and `.data/` are gitignored, so no secrets/data are committed.

### 2. Create the Vercel project
- Import the GitHub repo at <https://vercel.com/new> (framework auto-detected: Next.js).
- Don't deploy yet — add env vars + storage first (steps 3–4).

### 3. Add Upstash Redis (free)
- In the Vercel project → **Storage** → add **Upstash** (Redis) from the Marketplace.
- This auto-injects `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` into the
  project env. Nothing else to configure.

### 4. Set environment variables (Project → Settings → Environment Variables)
| Variable | Value |
|---|---|
| `XI_API_KEY` | your unrestricted ElevenLabs key |
| `AGENT_ID` | `agent_1301kswshvrjfaz954ft54a2z0n3` (Last Call) |
| `COCKTAILDB_KEY` | `1` (free tier) |
| `TOOL_SHARED_SECRET` | the same value as the ElevenLabs workspace secret used by `save_favorite` |
| `SUMMARY_USER` / `SUMMARY_PASSWORD` | any user/password you choose for the analytics page |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | (added automatically in step 3) |

Leave `PUBLIC_BASE_URL` and `POSTCALL_WEBHOOK_SECRET` for now — they need the domain
from the first deploy.

### 5. First deploy
- Deploy. Note the production domain, e.g. `https://last-call-xxxx.vercel.app`.
- Set `PUBLIC_BASE_URL=https://last-call-xxxx.vercel.app` in Vercel env.

### 6. Point the ElevenLabs agent at the production URL
From your local checkout (the CLI + scripts run locally against the live workspace):
```bash
# repoint the 6 webhook tool URLs to the prod domain + push them live
PUBLIC_BASE_URL=https://last-call-xxxx.vercel.app npm run tools:repoint

# (re)deploy the agent config so everything is consistent
npm run agent:push

# register the post-call webhook against the prod URL; this prints + saves a secret
node scripts/register-postcall-webhook.mjs --url https://last-call-xxxx.vercel.app/api/post-call
```
- Copy the `POSTCALL_WEBHOOK_SECRET` the script reports into Vercel env, then
  **redeploy** (Vercel → Deployments → Redeploy) so the new env vars load.
- Confirm the ElevenLabs **workspace secret** for `save_favorite` still matches
  `TOOL_SHARED_SECRET`.

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

## Operational notes
- **Quota:** every visitor shares your ElevenLabs monthly quota (creator tier
  ~121k chars / ~275 min). The rate limit stops abuse, but genuine popularity can
  still exhaust it; calls then fail until the monthly reset (or a plan bump). Diagnose
  any failed call via `GET /v1/convai/conversations/{id}` → `metadata.termination_reason`.
- **Re-running the webhook script** mints a NEW webhook each time — delete stale ones
  in the ElevenLabs dashboard (Settings → Webhooks).
- **Custom domain:** add it in Vercel, update `PUBLIC_BASE_URL`, then re-run step 6.
