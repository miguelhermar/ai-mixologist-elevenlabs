import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const readMock = vi.fn();
vi.mock("@/lib/callSummaries", () => ({
  readCallSummaries: () => readMock(),
}));

import { GET } from "./route";

describe("GET /api/summaries", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    readMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the persisted summaries", async () => {
    readMock.mockResolvedValue([{ conversationId: "conv_1", summary: "hi" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).summaries).toEqual([{ conversationId: "conv_1", summary: "hi" }]);
  });

  it("500s if the store read throws", async () => {
    readMock.mockRejectedValue(new Error("disk gone"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
