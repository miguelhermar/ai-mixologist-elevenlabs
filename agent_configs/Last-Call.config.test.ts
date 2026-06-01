import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Wire-shape regression guard for the Phase 4 agent config. These structures are
 * pushed verbatim to ElevenLabs, so a typo here silently breaks the live agent.
 * We assert the exact keys/values the platform expects (verified against the
 * installed @elevenlabs types), not the prose.
 */
const config = JSON.parse(
  readFileSync(resolve(process.cwd(), "agent_configs/Last-Call.json"), "utf8")
);

const cc = config.conversation_config;
const agent = cc.agent;
const prompt = agent.prompt;

describe("Last-Call agent config — Phase 4", () => {
  it("declares the system tools inline under prompt.built_in_tools", () => {
    const bt = prompt.built_in_tools;
    expect(Object.keys(bt).sort()).toEqual([
      "end_call",
      "language_detection",
      "skip_turn",
      "transfer_to_agent",
    ]);
    for (const [name, cfg] of Object.entries<Record<string, unknown>>(bt)) {
      expect(cfg.name).toBe(name);
      expect((cfg.params as { system_tool_type: string }).system_tool_type).toBe(
        name
      );
    }
  });

  it("does NOT put system tools in tool_ids (they are not webhook/client tools)", () => {
    // The 11 webhook/client tool ids remain; system tools are separate.
    expect(prompt.tool_ids).toHaveLength(11);
    expect(prompt.tool_ids.every((id: string) => id.startsWith("tool_"))).toBe(true);
  });

  it("attaches the bartending-101 knowledge base with usage_mode auto + RAG enabled", () => {
    expect(prompt.knowledge_base).toEqual([
      {
        type: "file",
        name: "bartending-101",
        id: expect.any(String),
        usage_mode: "auto",
      },
    ]);
    expect(prompt.knowledge_base[0].id).not.toHaveLength(0);
    expect(prompt.rag.enabled).toBe(true);
    expect(prompt.rag.embedding_model).toBe("e5_mistral_7b_instruct");
  });

  it("enables source attribution so the agent cites the knowledge base", () => {
    expect(cc.conversation.source_attribution).toBe(true);
  });

  it("registers Spanish as an additional language for language_detection", () => {
    expect(cc.language_presets).toHaveProperty("es");
    expect(cc.language_presets.es).toHaveProperty("overrides");
    // Keep English primary + a v2 TTS model (English agents reject *_v2_5).
    expect(agent.language).toBe("en");
    expect(cc.tts.model_id).toBe("eleven_flash_v2");
  });

  it("declares placeholder defaults for every dynamic variable used in the prompt", () => {
    const placeholders = agent.dynamic_variables.dynamic_variable_placeholders;
    const required = ["user_name", "taste_profile", "abv_mode", "available_spirits"];
    for (const key of required) {
      expect(placeholders[key], `missing default for ${key}`).toBeTruthy();
    }
    // Every {{var}} referenced in the prompt or first message must have a default,
    // or the call fails at init with "Missing required dynamic variables".
    const text = prompt.prompt + " " + agent.first_message;
    const referenced = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    for (const v of referenced) {
      expect(placeholders[v], `{{${v}}} has no placeholder default`).toBeDefined();
    }
  });
});

describe("Last-Call agent config — Phase 5 (post-call analytics)", () => {
  const ps = config.platform_settings;

  it("declares prompt evaluation criteria with the wire keys the platform expects", () => {
    const criteria = ps.evaluation.criteria;
    expect(Array.isArray(criteria)).toBe(true);
    expect(criteria.length).toBeGreaterThanOrEqual(1);
    const ids = criteria.map((c: { id: string }) => c.id);
    expect(ids).toContain("complete_recipe");
    for (const c of criteria) {
      expect(c.type).toBe("prompt");
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      // snake_case wire key (camelCased by the CLI on push, serialized back to snake).
      expect(typeof c.conversation_goal_prompt).toBe("string");
      expect(c.conversation_goal_prompt.length).toBeGreaterThan(0);
    }
  });

  it("configures the four data-collection items as snake_case ids (CLI preserves these keys)", () => {
    const dc = ps.data_collection;
    expect(Object.keys(dc).sort()).toEqual([
      "abv_mode",
      "favorite_cocktail",
      "made_a_drink",
      "taste_profile",
    ]);
    expect(dc.favorite_cocktail.type).toBe("string");
    expect(dc.taste_profile.type).toBe("string");
    expect(dc.made_a_drink.type).toBe("boolean");
    // abv_mode constrains to the same three values used everywhere else in the app.
    expect(dc.abv_mode.type).toBe("string");
    expect(dc.abv_mode.enum).toEqual(["regular", "low-abv", "zero-proof"]);
    // Every item must give the analysis LLM a description to extract against.
    for (const item of Object.values<Record<string, unknown>>(dc)) {
      expect(typeof item.description).toBe("string");
      expect((item.description as string).length).toBeGreaterThan(0);
    }
  });

  it("leaves post_call_webhook_id null in committed config (applied live by agent:webhook)", () => {
    // The webhook id is environment-specific (the tunnel URL), so it is wired live
    // by scripts/register-postcall-webhook.mjs, not committed here.
    expect(
      ps.workspace_overrides.webhooks.post_call_webhook_id
    ).toBeNull();
  });
});

describe("Last-Call agent config — Phase 6 (transfer to Sommelier)", () => {
  const agents = JSON.parse(
    readFileSync(resolve(process.cwd(), "agents.json"), "utf8")
  ).agents as { config: string; id: string }[];
  const sommelierId = agents.find((a) =>
    a.config.includes("Sommelier")
  )?.id;

  it("wires a transfer_to_agent system tool pointing at the live Sommelier", () => {
    const transfer = prompt.built_in_tools.transfer_to_agent;
    expect(transfer).toBeTruthy();
    expect(transfer.params.system_tool_type).toBe("transfer_to_agent");

    const transfers = transfer.params.transfers;
    expect(Array.isArray(transfers)).toBe(true);
    expect(transfers).toHaveLength(1);

    const t = transfers[0];
    // The agent_id must match the Sommelier registered in agents.json, or the
    // handoff transfers to a stale / non-existent agent.
    expect(t.agent_id).toBeTruthy();
    expect(t.agent_id).toBe(sommelierId);
    // A natural-language condition is what the LLM uses to decide to transfer.
    expect(typeof t.condition).toBe("string");
    expect(t.condition.toLowerCase()).toContain("wine");
    // We greet with the Sommelier's (var-free) first message on the way over.
    expect(t.enable_transferred_agent_first_message).toBe(true);
  });
});
