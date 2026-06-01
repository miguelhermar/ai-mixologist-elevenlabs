import { describe, it, expect, vi, afterEach } from "vitest";
import { playBell } from "@/lib/sound";

describe("playBell", () => {
  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    vi.restoreAllMocks();
  });

  it("never throws when Web Audio is unavailable (jsdom / SSR)", () => {
    expect(() => playBell()).not.toThrow();
  });

  it("builds a two-partial chime and resumes a suspended context", async () => {
    const osc = () => ({
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(() => ({ connect: vi.fn() })),
      start: vi.fn(),
      stop: vi.fn(),
    });
    const gainNode = () => ({
      gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    });
    const createOscillator = vi.fn(osc);
    const createGain = vi.fn(gainNode);
    const resume = vi.fn();

    // Regular function (not an arrow) so `new AudioContext()` returns our object.
    function FakeAudioContext() {
      return {
        currentTime: 0,
        state: "suspended",
        destination: {},
        resume,
        createGain,
        createOscillator,
      };
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;

    // Fresh module so the cached AudioContext (if any from another test) is reset.
    vi.resetModules();
    const { playBell: freshPlayBell } = await import("@/lib/sound");
    freshPlayBell();

    expect(resume).toHaveBeenCalled();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });
});
