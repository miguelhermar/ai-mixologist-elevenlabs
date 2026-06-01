#!/usr/bin/env node
/**
 * Reconcile the agent's dynamic-variable placeholders via the ElevenLabs API.
 *
 * Why this exists: `elevenlabs agents push` (CLI 0.5.3) runs `toCamelCaseKeys`
 * over the whole config before serializing, which camelCases the
 * `dynamic_variable_placeholders` *map keys* (e.g. `user_name` -> `userName`).
 * That breaks the match against the snake_case `{{user_name}}` references in the
 * prompt, so the platform stores an empty placeholder map. Without placeholders,
 * a guest who skips the pre-call form triggers a "Missing required dynamic
 * variables" call failure.
 *
 * The REST API accepts the snake_case map fine, so we PATCH it directly after a
 * push. The committed `agent_configs/Last-Call.json` stays the single source of
 * truth — we read the placeholders straight out of it.
 *
 * Usage:  node scripts/apply-agent-placeholders.mjs
 * Reads XI_API_KEY (or ELEVENLABS_API_KEY) from the environment or .env.local.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...args) => console.log("[apply-placeholders]", ...args);

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

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), "utf8"));
}

async function main() {
  const fileEnv = readEnvLocal();
  const apiKey =
    process.env.XI_API_KEY ||
    process.env.ELEVENLABS_API_KEY ||
    fileEnv.XI_API_KEY;
  if (!apiKey) {
    console.error("[apply-placeholders] No XI_API_KEY found (env or .env.local).");
    process.exit(1);
  }
  const apiBase =
    process.env.ELEVENLABS_API_BASE ||
    fileEnv.ELEVENLABS_API_BASE ||
    "https://api.elevenlabs.io";

  const agents = readJson("agents.json").agents ?? [];
  const config = readJson("agent_configs/Last-Call.json");
  const agentId = agents[0]?.id || process.env.AGENT_ID || fileEnv.AGENT_ID;
  if (!agentId) {
    console.error("[apply-placeholders] No agent id in agents.json / env.");
    process.exit(1);
  }

  const placeholders =
    config.conversation_config?.agent?.dynamic_variables
      ?.dynamic_variable_placeholders ?? {};
  const keys = Object.keys(placeholders);
  log(`agent ${agentId}: applying ${keys.length} placeholder(s): ${keys.join(", ")}`);

  const res = await fetch(`${apiBase}/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_config: {
        agent: {
          dynamic_variables: { dynamic_variable_placeholders: placeholders },
        },
      },
    }),
  });

  if (!res.ok) {
    console.error(
      `[apply-placeholders] PATCH failed (${res.status}): ${await res.text()}`
    );
    process.exit(1);
  }

  const body = await res.json();
  const applied =
    body.conversation_config?.agent?.dynamic_variables
      ?.dynamic_variable_placeholders ?? {};
  const appliedKeys = Object.keys(applied);
  if (appliedKeys.length !== keys.length) {
    console.error(
      `[apply-placeholders] Mismatch — expected ${keys.length}, got ${appliedKeys.length}:`,
      applied
    );
    process.exit(1);
  }
  log(`ok — live placeholders: ${JSON.stringify(applied)}`);
}

main().catch((err) => {
  console.error("[apply-placeholders] error:", err);
  process.exit(1);
});
