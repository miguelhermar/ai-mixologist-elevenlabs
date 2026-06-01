import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CallSummaryList, formatDuration } from "./CallSummaryList";
import type { CallSummary } from "@/lib/postcall";

function makeSummary(over: Partial<CallSummary> = {}): CallSummary {
  return {
    conversationId: "conv_abc",
    agentId: "agent_1",
    receivedAt: "2026-05-31T12:00:00.000Z",
    eventTimestamp: 1_716_000_000,
    durationSecs: 95,
    callSuccessful: "success",
    summary: "Guest wanted something sour and made a Margarita.",
    dataCollection: {
      favorite_cocktail: { value: "Margarita", rationale: "chose it" },
      made_a_drink: { value: true, rationale: "ran a timer" },
    },
    evaluations: {
      complete_recipe: { result: "success", rationale: "full recipe given" },
    },
    ...over,
  };
}

describe("formatDuration", () => {
  it("formats sub-minute and minute durations, and guards bad input", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(-3)).toBeNull();
  });
});

describe("CallSummaryList", () => {
  it("shows an empty state when there are no summaries", () => {
    render(<CallSummaryList summaries={[]} />);
    expect(screen.getByTestId("summary-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("call-summary")).not.toBeInTheDocument();
  });

  it("renders a summary card with the recap, data collection, and evaluation", () => {
    render(<CallSummaryList summaries={[makeSummary()]} />);
    expect(screen.getByText(/made a Margarita/i)).toBeInTheDocument();
    // Verdict badge.
    expect(screen.getByText(/Successful call/i)).toBeInTheDocument();
    // Data collection: humanized labels + values (boolean -> Yes).
    expect(screen.getByText("Favorite cocktail")).toBeInTheDocument();
    expect(screen.getByText("Margarita")).toBeInTheDocument();
    expect(screen.getByText("Made a drink")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    // Evaluation criterion shows as met.
    expect(screen.getByText("Complete recipe")).toBeInTheDocument();
    expect(screen.getByText("Met")).toBeInTheDocument();
  });

  it("renders one card per conversation", () => {
    render(
      <CallSummaryList
        summaries={[
          makeSummary({ conversationId: "a" }),
          makeSummary({ conversationId: "b" }),
        ]}
      />
    );
    expect(screen.getAllByTestId("call-summary")).toHaveLength(2);
  });

  it("falls back gracefully when there is no summary text", () => {
    render(
      <CallSummaryList
        summaries={[makeSummary({ summary: null, dataCollection: {}, evaluations: {} })]}
      />
    );
    expect(screen.getByText(/No summary was generated/i)).toBeInTheDocument();
  });
});
