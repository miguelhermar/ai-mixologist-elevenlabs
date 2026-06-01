import Link from "next/link";
import { readCallSummaries } from "@/lib/callSummaries";
import { CallSummaryList } from "@/components/CallSummaryList";

/**
 * `/summary` — the post-call analytics page (Phase 5).
 *
 * A server component that reads the persisted call summaries straight from the
 * local store (no client fetch) and renders them. `force-dynamic` so it re-reads
 * the store on every request rather than caching the first render.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Last Call — Call summaries",
};

export default async function SummaryPage() {
  const summaries = await readCallSummaries();

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-amber-300/80">
              Last Call
            </p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Call summaries</h1>
            <p className="mt-2 text-sm text-white/60">
              What each guest talked about, what they wanted, and how the call went —
              extracted by ElevenLabs after the conversation ends.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:bg-white/10"
          >
            ← Back to the bar
          </Link>
        </header>

        <CallSummaryList summaries={summaries} />
      </div>
    </div>
  );
}
