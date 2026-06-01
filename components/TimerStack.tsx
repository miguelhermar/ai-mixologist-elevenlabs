"use client";

import { useEffect, useRef, useState } from "react";
import { useBarStore, type BarTimer } from "@/lib/store";
import { playBell } from "@/lib/sound";

/**
 * Live countdowns started by the agent's `start_timer` tool (shake/steep/chill).
 * Timers are wall-clock based (`endsAt`), so a single 1-second tick re-renders
 * the whole stack; we never store the decrementing value, only recompute it.
 */

/** Format remaining seconds as M:SS (clamped at zero). */
export function formatRemaining(ms: number): string {
  const totalSecs = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function TimerRow({ timer, now }: { timer: BarTimer; now: number }) {
  const removeTimer = useBarStore((s) => s.removeTimer);
  const remainingMs = timer.endsAt - now;
  const done = remainingMs <= 0;

  // Ring a bell the moment a running timer crosses to done — once, and only on a
  // live transition (a timer that's already expired on mount stays silent, so
  // revisiting the page doesn't chime).
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) playBell();
    wasDone.current = done;
  }, [done]);

  return (
    <li
      data-testid="timer-row"
      data-done={done}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
        done
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-current/15 bg-current/[0.06]"
      }`}
    >
      <span className="truncate">{timer.label}</span>
      <span className="flex items-center gap-2">
        <span
          className={`font-mono tabular-nums ${done ? "text-emerald-300" : ""}`}
          aria-live={done ? "polite" : "off"}
        >
          {done ? "Done!" : formatRemaining(remainingMs)}
        </span>
        <button
          type="button"
          onClick={() => removeTimer(timer.id)}
          aria-label={`Dismiss timer ${timer.label}`}
          className="rounded-full px-1.5 text-current/65 transition hover:text-current"
        >
          ✕
        </button>
      </span>
    </li>
  );
}

export function TimerStack() {
  const timers = useBarStore((s) => s.timers);
  const [now, setNow] = useState(() => Date.now());

  // One ticker for the whole stack; only runs while there are timers.
  useEffect(() => {
    if (timers.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timers.length]);

  if (timers.length === 0) return null;

  return (
    <section aria-label="Timers" data-testid="timer-stack" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-current/70">
        Timers
      </h3>
      <ul className="space-y-2">
        {timers.map((t) => (
          <TimerRow key={t.id} timer={t} now={now} />
        ))}
      </ul>
    </section>
  );
}
