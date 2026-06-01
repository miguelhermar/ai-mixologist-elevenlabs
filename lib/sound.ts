/**
 * Tiny Web Audio "bell" for timer completion (Phase 3 polish).
 *
 * Synthesized rather than shipping an audio asset: no binary in the repo, works
 * offline, and it's a pure browser concern. It's a *nice-to-have* — every path
 * is guarded and swallowed so a missing/blocked AudioContext can never break the
 * timer UI. A user gesture has already happened by the time a timer can finish
 * (they clicked "Step up to the bar"), so the context is allowed to make sound.
 */

let sharedCtx: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

/** Resolve a usable AudioContext constructor, or null when unavailable (SSR/tests). */
function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Play a short, soft two-partial bell. Safe to call anywhere — no-ops (without
 * throwing) when Web Audio isn't available.
 */
export function playBell(): void {
  try {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;

    sharedCtx = sharedCtx ?? new Ctor();
    const ctx = sharedCtx;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    // Quick attack, gentle ~1.2s decay.
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    master.connect(ctx.destination);

    // A fundamental + a higher partial gives it a bell-ish timbre.
    const partials: Array<{ freq: number; gain: number }> = [
      { freq: 880, gain: 1 },
      { freq: 1320, gain: 0.4 },
    ];
    for (const { freq, gain } of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 1.2);
    }
  } catch {
    // A failed chime must never affect the timer — ignore.
  }
}
