import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { saveCallSummary, readCallSummaries } from "./callSummaries";
import type { CallSummary } from "./postcall";

function makeSummary(over: Partial<CallSummary> = {}): CallSummary {
  return {
    conversationId: "conv_1",
    agentId: "agent_1",
    receivedAt: "2026-05-31T12:00:00.000Z",
    eventTimestamp: 1_716_000_000,
    durationSecs: 60,
    callSuccessful: "success",
    summary: "A nice chat.",
    dataCollection: { favorite_cocktail: { value: "Margarita", rationale: "chose it" } },
    evaluations: { complete_recipe: { result: "success", rationale: "ok" } },
    ...over,
  };
}

describe("call summaries store", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "last-call-sum-"));
    file = path.join(dir, "nested", "call-summaries.json"); // nested → exercises mkdir
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns [] when the store does not exist yet", async () => {
    expect(await readCallSummaries(file)).toEqual([]);
  });

  it("creates the file/dir on first write and round-trips", async () => {
    const after = await saveCallSummary(makeSummary(), file);
    expect(after).toHaveLength(1);
    const reread = await readCallSummaries(file);
    expect(reread[0].conversationId).toBe("conv_1");
    expect(reread[0].summary).toBe("A nice chat.");
  });

  it("upserts by conversationId (a retry does not duplicate)", async () => {
    await saveCallSummary(makeSummary({ summary: "first" }), file);
    const after = await saveCallSummary(makeSummary({ summary: "second" }), file);
    expect(after).toHaveLength(1);
    expect(after[0].summary).toBe("second");
  });

  it("keeps distinct conversations and returns them newest-first", async () => {
    await saveCallSummary(
      makeSummary({ conversationId: "old", receivedAt: "2026-05-31T10:00:00.000Z" }),
      file
    );
    await saveCallSummary(
      makeSummary({ conversationId: "new", receivedAt: "2026-05-31T11:00:00.000Z" }),
      file
    );
    const list = await readCallSummaries(file);
    expect(list.map((s) => s.conversationId)).toEqual(["new", "old"]);
  });
});
