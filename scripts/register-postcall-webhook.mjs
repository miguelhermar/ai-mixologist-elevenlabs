#!/usr/bin/env node
/**
 * Register the post-call webhook on the ElevenLabs workspace and wire it to the
 * Last Call agent (Phase 5).
 *
 * Why a script: like the knowledge base (Phase 4), workspace webhooks are
 * REST-API only — the CLI has no command for them. And the webhook URL is
 * environment-specific (the cloudflared tunnel), so it intentionally does NOT
 * live in the committed agent config; we apply it live here instead.
 *
 * What it does:
 *   1. POST /v1/workspace/webhooks  { settings:{ auth_type:"hmac", name, webhook_url } }
 *      -> { webhook_id, webhook_secret }   (the secret is shown ONCE, at creation)
 *   2. Save the secret into .env.local as POSTCALL_WEBHOOK_SECRET (gitignored).
 *   3. PATCH the agent: platform_settings.workspace_overrides.webhooks.post_call_webhook_id
 *   4. Re-GET the agent to confirm the link stuck.
 *
 * Usage:
 *   node scripts/register-postcall-webhook.mjs                 # url = $PUBLIC_BASE_URL/api/post-call
 *   node scripts/register-postcall-webhook.mjs --url https://abc.trycloudflare.com/api/post-call
 *
 * Re-running creates a NEW webhook and repoints the agent at it; delete stale
 * ones in the ElevenLabs dashboard (Settings -> Webhooks) if you like.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...args) => console.log("[register-webhook]", ...args);
const die = (msg) => {
  console.error("[register-webhook]", msg);
  process.exit(1);
};

/** Minimal .env.local reader (KEY=value lines) — no dependency on dotenv. */
function readEnvLocal() {
  try {
    const text = readFileSync(resolve(root, ".env.local"), "utf8");
    const env = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

/** Upsert a single KEY=value in .env.local, preserving everything else. */
function upsertEnvLocal(key, value) {
  const path = resolve(root, ".env.local");
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    /* file may not exist yet */
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    text += (text.endsWith("\n") || text === "" ? "" : "\n") + line + "\n";
  }
  writeFileSync(path, text, "utf8");
}

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), "utf8"));
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const fileEnv = readEnvLocal();
  const apiKey =
    process.env.XI_API_KEY || process.env.ELEVENLABS_API_KEY || fileEnv.XI_API_KEY;
  if (!apiKey) die("No XI_API_KEY found (env or .env.local).");

  const apiBase =
    process.env.ELEVENLABS_API_BASE ||
    fileEnv.ELEVENLABS_API_BASE ||
    "https://api.elevenlabs.io";

  const publicBase = (
    argValue("--url") && argValue("--url").replace(/\/api\/post-call$/, "")
  ) ||
    process.env.PUBLIC_BASE_URL ||
    fileEnv.PUBLIC_BASE_URL;
  if (!publicBase) {
    die("No webhook URL — set PUBLIC_BASE_URL in .env.local or pass --url <https://.../api/post-call>.");
  }
  const webhookUrl = argValue("--url") || `${publicBase.replace(/\/$/, "")}/api/post-call`;
  if (!webhookUrl.startsWith("https://")) {
    die(`Webhook URL must be HTTPS (got ${webhookUrl}). Use the cloudflared tunnel URL.`);
  }

  const agents = readJson("agents.json").agents ?? [];
  const agentId = agents[0]?.id || process.env.AGENT_ID || fileEnv.AGENT_ID;
  if (!agentId) die("No agent id in agents.json / env.");

  const headers = { "xi-api-key": apiKey, "Content-Type": "application/json" };

  // 1. Create the HMAC webhook.
  log(`creating webhook -> ${webhookUrl}`);
  const createRes = await fetch(`${apiBase}/v1/workspace/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      settings: {
        auth_type: "hmac",
        name: "Last Call post-call analytics",
        webhook_url: webhookUrl,
      },
    }),
  });
  if (!createRes.ok) {
    die(`create webhook failed (${createRes.status}): ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const webhookId = created.webhook_id;
  const secret = created.webhook_secret;
  if (!webhookId) die(`create webhook returned no webhook_id: ${JSON.stringify(created)}`);
  log(`webhook created: ${webhookId}`);

  // 2. Persist the secret (shown only once) into .env.local.
  if (secret) {
    upsertEnvLocal("POSTCALL_WEBHOOK_SECRET", secret);
    log("saved POSTCALL_WEBHOOK_SECRET to .env.local (restart `npm run dev` to load it)");
  } else {
    log("NOTE: no webhook_secret returned — set POSTCALL_WEBHOOK_SECRET from the dashboard.");
  }

  // 3. Link the webhook to the agent.
  log(`linking webhook to agent ${agentId}`);
  const patchRes = await fetch(`${apiBase}/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      platform_settings: {
        workspace_overrides: { webhooks: { post_call_webhook_id: webhookId } },
      },
    }),
  });
  if (!patchRes.ok) {
    die(`link webhook failed (${patchRes.status}): ${await patchRes.text()}`);
  }

  // 4. Confirm.
  const getRes = await fetch(`${apiBase}/v1/convai/agents/${agentId}`, { headers });
  const agent = await getRes.json();
  const linked =
    agent.platform_settings?.workspace_overrides?.webhooks?.post_call_webhook_id;
  if (linked !== webhookId) {
    die(`link not confirmed — agent has post_call_webhook_id=${linked}, expected ${webhookId}`);
  }

  log(`✅ done. Agent ${agentId} now posts call analytics to ${webhookUrl}`);
  log("   Have a voice call, end it, then check /summary (or GET /api/summaries).");
}

main().catch((err) => {
  console.error("[register-webhook] error:", err);
  process.exit(1);
});
