#!/usr/bin/env node
/**
 * Repoint the 6 webhook tool configs at the current public base URL, then push.
 *
 * The webhook tools (`tool_configs/*.json`) hard-code an absolute `api_schema.url`
 * because ElevenLabs' cloud calls them over the internet. The host changes every
 * time the public URL does (the old cloudflared tunnel, now a stable Vercel
 * domain). This rewrites just the origin (scheme + host) of each tool's url from
 * `PUBLIC_BASE_URL`, preserving each path (`/api/cocktails/{id}` etc.), then runs
 * `elevenlabs tools push` so the live tools point at the new host.
 *
 * Usage:
 *   PUBLIC_BASE_URL=https://your-app.vercel.app node scripts/repoint-tools.mjs
 *   node scripts/repoint-tools.mjs --url https://your-app.vercel.app
 *   node scripts/repoint-tools.mjs --url https://your-app.vercel.app --no-push
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => console.log("[repoint-tools]", ...a);
const die = (msg) => {
  console.error("[repoint-tools]", msg);
  process.exit(1);
};

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Minimal .env.local reader (KEY=value), so the script works without dotenv. */
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

const fileEnv = readEnvLocal();
const base =
  argValue("--url") || process.env.PUBLIC_BASE_URL || fileEnv.PUBLIC_BASE_URL;
if (!base) die("No base URL — set PUBLIC_BASE_URL or pass --url https://your-app.vercel.app");

let origin;
try {
  origin = new URL(base).origin; // scheme + host (+ port)
} catch {
  die(`Invalid base URL: ${base}`);
}
if (!origin.startsWith("https://")) die(`Base URL must be HTTPS (got ${origin}).`);

const dir = resolve(root, "tool_configs");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
let changed = 0;

for (const file of files) {
  const path = join(dir, file);
  const config = JSON.parse(readFileSync(path, "utf8"));
  const current = config?.api_schema?.url;
  if (!current) continue; // client tools have no api_schema.url — skip
  // Swap ONLY the origin (scheme + host[+port]); keep the path verbatim so
  // path-param placeholders like `/api/cocktails/{id}` aren't percent-encoded.
  const next = current.replace(/^https?:\/\/[^/]+/, origin);
  if (!/^https?:\/\//.test(current)) {
    die(`${file}: api_schema.url is not absolute (${current}) — cannot repoint.`);
  }
  if (next === current) {
    log(`unchanged: ${file}`);
    continue;
  }
  config.api_schema.url = next;
  writeFileSync(path, JSON.stringify(config, null, 4) + "\n", "utf8");
  log(`repointed ${file} -> ${next}`);
  changed++;
}

log(`${changed} tool config(s) updated to ${origin}`);

if (process.argv.includes("--no-push")) {
  log("--no-push: skipping `elevenlabs tools push`");
  process.exit(0);
}

log("pushing tools to ElevenLabs…");
const res = spawnSync("npx", ["elevenlabs", "tools", "push"], {
  cwd: root,
  stdio: "inherit",
});
if (res.status !== 0) die(`\`elevenlabs tools push\` failed (exit ${res.status}).`);
log("✅ done. Live webhook tools now point at " + origin);
