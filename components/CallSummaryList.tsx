import type { CallSummary } from "@/lib/postcall";

/**
 * Presentational list of post-call analytics summaries (Phase 5). Pure — takes the
 * persisted summaries and renders them; no store, no fetch, no "use client", so it
 * renders in the `/summary` server page and unit-tests cleanly.
 *
 * Each card shows the AI transcript summary, the call-success verdict, and the two
 * structured analysis outputs the agent is configured for: data collection
 * (favorite cocktail, taste profile, ABV mode, whether they made a drink) and the
 * evaluation criteria (pass/fail with the LLM's rationale).
 */

/** Humanize a snake_case id, e.g. `favorite_cocktail` -> `Favorite cocktail`. */
function humanize(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render a data-collection value for display. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Seconds -> `m:ss` (or `Ns` under a minute). */
export function formatDuration(secs: number | null): string | null {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return null;
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const VERDICT_STYLE: Record<string, string> = {
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  failure: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  unknown: "border-amber-400/40 bg-amber-400/10 text-amber-300",
};

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  const style = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.unknown;
  const label =
    verdict === "success"
      ? "Successful call"
      : verdict === "failure"
        ? "Unsuccessful call"
        : "Outcome unclear";
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}

function CriterionBadge({ result }: { result: string | null }) {
  const style = result ? (VERDICT_STYLE[result] ?? VERDICT_STYLE.unknown) : VERDICT_STYLE.unknown;
  const label = result === "success" ? "Met" : result === "failure" ? "Not met" : "Unclear";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[0.7rem] font-medium ${style}`}>
      {label}
    </span>
  );
}

function SummaryCard({ summary }: { summary: CallSummary }) {
  const duration = formatDuration(summary.durationSecs);
  const dataEntries = Object.entries(summary.dataCollection);
  const evalEntries = Object.entries(summary.evaluations);

  return (
    <article
      data-testid="call-summary"
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {new Date(summary.receivedAt).toLocaleString()}
          </h2>
          <p className="text-xs text-white/50">
            Conversation {summary.conversationId}
            {duration ? ` · ${duration}` : ""}
          </p>
        </div>
        <VerdictBadge verdict={summary.callSuccessful} />
      </div>

      {summary.summary ? (
        <p className="text-pretty text-sm text-white/80">{summary.summary}</p>
      ) : (
        <p className="text-sm italic text-white/50">No summary was generated.</p>
      )}

      {dataEntries.length > 0 ? (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dataEntries.map(([key, item]) => (
            <div
              key={key}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <dt className="text-[0.7rem] uppercase tracking-wide text-white/45">
                {humanize(key)}
              </dt>
              <dd className="text-sm text-white/90">{formatValue(item.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {evalEntries.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-[0.7rem] uppercase tracking-wide text-white/45">
            Evaluation
          </h3>
          <ul className="space-y-1.5">
            {evalEntries.map(([key, item]) => (
              <li key={key} className="flex items-center gap-2 text-sm">
                <CriterionBadge result={item.result} />
                <span className="text-white/80">{humanize(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function CallSummaryList({ summaries }: { summaries: CallSummary[] }) {
  if (summaries.length === 0) {
    return (
      <p data-testid="summary-empty" className="text-sm text-white/60">
        No calls yet. Step up to the bar and have a conversation — once it ends,
        ElevenLabs sends the recap here.
      </p>
    );
  }

  return (
    <div data-testid="summary-list" className="space-y-4">
      {summaries.map((summary) => (
        <SummaryCard key={summary.conversationId} summary={summary} />
      ))}
    </div>
  );
}
