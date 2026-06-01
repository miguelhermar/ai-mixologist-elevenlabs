import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Wire-shape regression guard for the Phase 6 Sommelier sub-agent. This config is
 * pushed verbatim to ElevenLabs, so a typo here silently breaks the live agent or
 * the bidirectional transfer. We assert the exact keys/values the platform expects
 * (verified against the installed @elevenlabs types + live docs), not the prose.
 */
const config = JSON.parse(
  readFileSync(resolve(process.cwd(), "agent_configs/Sommelier.json"), "utf8")
);
const agents = JSON.parse(
  readFileSync(resolve(process.cwd(), "agents.json"), "utf8")
).agents as { config: string; id: string }[];

const cc = config.conversation_config;
const agent = cc.agent;
const prompt = agent.prompt;

const LAST_CALL_ID = "agent_1301kswshvrjfaz954ft54a2z0n3";

describe("Sommelier agent config — Phase 6", () => {
  it("is registered in agents.json with a live id", () => {
    const entry = agents.find((a) => a.config.includes("Sommelier"));
    expect(entry).toBeTruthy();
    expect(entry!.id).toMatch(/^agent_/);
  });

  it("uses a voice distinct from Last Call's (Lily, not Eric)", () => {
    // Last Call is cjVigY5qzO86Huf0OWal (Eric). The whole point of the sub-agent
    // is a recognizably different voice on transfer.
    expect(cc.tts.voice_id).toBe("pFZP5JQG7iQjIQuC4Bku");
    expect(cc.tts.voice_id).not.toBe("cjVigY5qzO86Huf0OWal");
    // English-primary agent must keep a *_v2 TTS model (v2_5 is rejected).
    expect(agent.language).toBe("en");
    expect(cc.tts.model_id).toBe("eleven_flash_v2");
  });

  it("references NO dynamic variables (they may not persist across a transfer)", () => {
    // The Sommelier is only ever reached via transfer; if its prompt/first message
    // required a {{var}} that didn't carry over, the call would fail at handoff.
    // It personalizes from the preserved transcript instead.
    const text = prompt.prompt + " " + agent.first_message;
    const referenced = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    expect(referenced).toEqual([]);
  });

  it("has a non-empty first message for the audible handoff greeting", () => {
    expect(typeof agent.first_message).toBe("string");
    expect(agent.first_message.length).toBeGreaterThan(0);
  });

  it("attaches the wine-pairing-101 knowledge base with RAG + source attribution", () => {
    expect(prompt.knowledge_base).toEqual([
      {
        type: "file",
        name: "wine-pairing-101",
        id: expect.any(String),
        usage_mode: "auto",
      },
    ]);
    expect(prompt.knowledge_base[0].id.length).toBeGreaterThan(0);
    expect(prompt.rag.enabled).toBe(true);
    expect(prompt.rag.embedding_model).toBe("e5_mistral_7b_instruct");
    expect(cc.conversation.source_attribution).toBe(true);
  });

  it("declares end_call, skip_turn, and a transfer back to Last Call", () => {
    const bt = prompt.built_in_tools;
    expect(Object.keys(bt).sort()).toEqual([
      "end_call",
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

  it("transfers back to the Last Call bar concierge for non-wine drinks", () => {
    const transfers = prompt.built_in_tools.transfer_to_agent.params.transfers;
    expect(transfers).toHaveLength(1);
    const t = transfers[0];
    expect(t.agent_id).toBe(LAST_CALL_ID);
    expect(typeof t.condition).toBe("string");
    expect(t.condition.length).toBeGreaterThan(0);
    // Don't re-trigger Last Call's {{user_name}} first message on the way back.
    expect(t.enable_transferred_agent_first_message).toBe(false);
  });
});
