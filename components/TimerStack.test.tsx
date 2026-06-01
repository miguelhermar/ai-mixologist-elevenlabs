import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

// The completion chime is a browser-only side effect; mock it so we can assert
// it rings exactly once on a live transition without touching Web Audio.
vi.mock("@/lib/sound", () => ({ playBell: vi.fn() }));

import { TimerStack, formatRemaining } from "./TimerStack";
import { playBell } from "@/lib/sound";
import { useBarStore, DEFAULT_AMBIANCE } from "@/lib/store";

function reset() {
  localStorage.clear();
  useBarStore.setState({
    recipe: null,
    timers: [],
    shoppingList: [],
    ambiance: DEFAULT_AMBIANCE,
  });
}

describe("formatRemaining", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatRemaining(125_000)).toBe("2:05");
    expect(formatRemaining(9_000)).toBe("0:09");
  });

  it("clamps negatives to zero", () => {
    expect(formatRemaining(-5_000)).toBe("0:00");
  });
});

describe("TimerStack", () => {
  beforeEach(() => {
    reset();
    vi.mocked(playBell).mockClear();
  });

  it("renders nothing when there are no timers", () => {
    const { container } = render(<TimerStack />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an active timer with a remaining countdown", () => {
    useBarStore.setState({
      timers: [
        { id: "a", label: "Shake", endsAt: Date.now() + 30_000, durationSecs: 30 },
      ],
    });
    render(<TimerStack />);
    expect(screen.getByText("Shake")).toBeInTheDocument();
    const row = screen.getByTestId("timer-row");
    expect(row.getAttribute("data-done")).toBe("false");
  });

  it("marks an expired timer as done", () => {
    useBarStore.setState({
      timers: [
        { id: "b", label: "Chill", endsAt: Date.now() - 1_000, durationSecs: 60 },
      ],
    });
    render(<TimerStack />);
    expect(screen.getByText("Done!")).toBeInTheDocument();
    expect(screen.getByTestId("timer-row").getAttribute("data-done")).toBe("true");
  });

  it("does NOT ring for a timer that's already expired on mount", () => {
    useBarStore.setState({
      timers: [
        { id: "c", label: "Old", endsAt: Date.now() - 5_000, durationSecs: 30 },
      ],
    });
    render(<TimerStack />);
    expect(playBell).not.toHaveBeenCalled();
  });

  it("rings the bell once when a running timer crosses to done", () => {
    vi.useFakeTimers();
    try {
      useBarStore.setState({
        timers: [
          { id: "d", label: "Shake", endsAt: Date.now() + 1_500, durationSecs: 15 },
        ],
      });
      render(<TimerStack />);
      expect(playBell).not.toHaveBeenCalled();
      // Advance past the deadline; the 1s ticker re-renders and the row crosses to done.
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(playBell).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
