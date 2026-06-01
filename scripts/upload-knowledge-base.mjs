#!/usr/bin/env node
/**
 * Upload a markdown file to the ElevenLabs knowledge base and RAG-index it.
 *
 * Why a script: the knowledge base / RAG endpoints are REST-API only (the CLI has
 * no KB commands). Phase 4 did this by hand for bartending-101; Phase 6 needs a
 * second doc (wine-pairing-101 for the Sommelier), so this captures the exact
 * steps once and makes them reproducible.
 *
 * What it does:
 *   1. POST /v1/convai/knowledge-base/file  (multipart: file, name)  -> { id }
 *   2. POST /v1/convai/knowledge-base/{id}/rag-index { model } to start indexing
 *   3. Poll the same endpoint until status === "succeeded" (or fail loudly)
 *   4. Print the doc id to wire into the agent config's prompt.knowledge_base[]
 *
 * Usage:
 *   node scripts/upload-knowledge-base.mjs knowledge-base/wine-pairing-101.md wine-pairing-101
 *   node scripts/upload-knowledge-base.mjs <path> <name> [--model e5_mistral_7b_instruct]
 *
 * Notes:
 *   - The doc must be >= 500 bytes or indexing returns "document_too_small".
 *   - The model MUST match the agent's prompt.rag.embedding_model.
 *   - Re-running uploads a NEW document (new id); delete stale ones in the dashboard.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => console.log("[upload-kb]", ...a);
const die = (msg) => {
  console.error("[upload-kb]", msg);
  process.exit(1);
};

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

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [, , filePathArg, nameArg] = process.argv;
  if (!filePathArg) {
    die("Usage: node scripts/upload-knowledge-base.mjs <path> <name> [--model <embedding_model>]");
  }
  const filePath = resolve(root, filePathArg);
  const name = nameArg || basename(filePathArg).replace(/\.[^.]+$/, "");
  const model = argValue("--model", "e5_mistral_7b_instruct");

  const fileEnv = readEnvLocal();
  const apiKey =
    process.env.XI_API_KEY || process.env.ELEVENLABS_API_KEY || fileEnv.XI_API_KEY;
  if (!apiKey) die("No XI_API_KEY found (env or .env.local).");
  const apiBase =
    process.env.ELEVENLABS_API_BASE || fileEnv.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";

  const bytes = readFileSync(filePath);
  if (bytes.length < 500) {
    die(`Doc is only ${bytes.length} bytes; needs >= 500 or RAG returns "document_too_small".`);
  }

  // 1. Upload the file.
  log(`uploading ${filePathArg} as "${name}" (${bytes.length} bytes)`);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "text/markdown" }), basename(filePath));
  form.append("name", name);
  const upRes = await fetch(`${apiBase}/v1/convai/knowledge-base/file`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!upRes.ok) die(`upload failed (${upRes.status}): ${await upRes.text()}`);
  const doc = await upRes.json();
  const docId = doc.id;
  if (!docId) die(`upload returned no id: ${JSON.stringify(doc)}`);
  log(`uploaded -> doc id ${docId}`);

  // 2. Kick off RAG indexing.
  log(`starting RAG index (model ${model})`);
  const idxRes = await fetch(`${apiBase}/v1/convai/knowledge-base/${docId}/rag-index`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!idxRes.ok) die(`rag-index start failed (${idxRes.status}): ${await idxRes.text()}`);

  // 3. Poll to completion.
  const terminalOk = "succeeded";
  const terminalBad = ["failed", "document_too_small", "rag_limit_exceeded", "cannot_index_folder"];
  for (let attempt = 1; attempt <= 30; attempt++) {
    const pollRes = await fetch(`${apiBase}/v1/convai/knowledge-base/${docId}/rag-index`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const poll = await pollRes.json();
    const status = poll.status || poll.rag_index_status || JSON.stringify(poll);
    log(`  index status: ${status} (attempt ${attempt})`);
    if (status === terminalOk) {
      log(`✅ done. KB doc "${name}" is RAG-indexed.`);
      log(`   Wire into the agent config:`);
      log(`   prompt.knowledge_base += { "type":"file", "name":"${name}", "id":"${docId}", "usage_mode":"auto" }`);
      return;
    }
    if (terminalBad.includes(status)) die(`indexing ended in "${status}".`);
    await sleep(2000);
  }
  die("timed out waiting for RAG index to reach 'succeeded'.");
}

main().catch((err) => {
  console.error("[upload-kb] error:", err);
  process.exit(1);
});
