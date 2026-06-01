"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useBarStore } from "@/lib/store";
import { ambianceTheme } from "@/lib/ambiance";
import { BarConcierge } from "@/components/BarConcierge";
import { RecipeCard } from "@/components/RecipeCard";
import { TimerStack } from "@/components/TimerStack";
import { ShoppingList } from "@/components/ShoppingList";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

/**
 * The two-column "bar dashboard" (Phase 3). Left: the voice widget + intro.
 * Right: the live panels the agent drives — recipe card, timers, shopping list.
 * The whole surface is themed by the current `ambiance` (set via the agent's
 * `set_ambiance` tool).
 *
 * Hydration: the store uses `skipHydration` (it persists to localStorage, which
 * doesn't exist on the server), so the server and first client render both use
 * the default ambiance — they match. Rehydrating on mount then re-renders with
 * the persisted ambiance/shopping list, with no hydration mismatch.
 */
export function Dashboard() {
  const ambiance = useBarStore((s) => s.ambiance);

  useEffect(() => {
    void useBarStore.persist.rehydrate();
  }, []);

  const theme = ambianceTheme(ambiance);

  return (
    <div className={`min-h-screen ${theme.page} transition-colors duration-500`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p
              className={`text-sm uppercase tracking-[0.35em] ${theme.accent}`}
            >
              Last Call
            </p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">
              Your AI mixologist &amp; bar concierge
            </h1>
          </div>
          <ThemeSwitcher />
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {/* Left: the conversation */}
          <div className="flex flex-col gap-6">
            <p className="text-pretty text-current/80">
              Tell me your mood or what bottles you&apos;ve got, and I&apos;ll mix
              you something good — hands-free. Grant your mic, step up to the bar,
              and start talking. I&apos;ll show the recipe, run timers, and keep a
              shopping list as we go.
            </p>
            <div className="rounded-2xl border border-current/10 bg-current/[0.06] p-8">
              <BarConcierge />
            </div>
          </div>

          {/* Right: the live panels the agent drives */}
          <div className="flex flex-col gap-5">
            <RecipeCard />
            <TimerStack />
            <ShoppingList />
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-current/65">
          <span>Powered by ElevenLabs</span>
          <Link
            href="/summary"
            className="underline-offset-2 transition hover:text-current hover:underline"
          >
            Your visit recaps →
          </Link>
        </footer>
      </div>
    </div>
  );
}
