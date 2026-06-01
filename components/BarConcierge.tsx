"use client";

import { useMemo, useState } from "react";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from "@elevenlabs/react";
import { createLogger } from "@/lib/logger";
import { buildClientTools } from "@/lib/clientTools";
import { useBarStore } from "@/lib/store";
import { PreCallForm } from "@/components/PreCallForm";
import {
  EMPTY_FORM,
  buildDynamicVariables,
  type PersonalizationForm,
} from "@/lib/personalization";

const log = createLogger("widget");

/**
 * The voice widget.
 *
 * Flow: fetch a signed URL from our own `/api/signed-url` route (which keeps the
 * API key server-side), then open a private WebSocket conversation with the
 * agent via the ElevenLabs React SDK. Phase 3 also registers the browser-side
 * **client tools** (recipe card, timers, shopping list, ambiance) so the agent
 * can drive the on-screen UI; those handlers mutate the zustand bar store.
 */
export function BarConcierge() {
  return (
    <ConversationProvider>
      <ConciergeControls />
    </ConversationProvider>
  );
}

const STATUS_COPY: Record<string, string> = {
  disconnected: "Bar's closed — tap to come in",
  connecting: "Pouring you in…",
  connected: "You're at the bar — say hello",
  error: "Something spilled — try again",
};

function ConciergeControls() {
  const { startSession, endSession } = useConversationControls();
  const { status, message } = useConversationStatus();
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Optional pre-call personalization → the agent's dynamic variables.
  const [form, setForm] = useState<PersonalizationForm>(EMPTY_FORM);

  // Browser-side tools the agent can call to drive the on-screen UI. The
  // handlers read the latest store via getState(), so this can be built once.
  const clientTools = useMemo(
    () => buildClientTools({ store: useBarStore }),
    []
  );

  const isActive = status === "connected" || status === "connecting";
  const busy = preparing || status === "connecting";
  // Connection errors surface via the SDK status; pre-connection (fetch)
  // failures surface via local state.
  const errorText = error ?? (status === "error" ? message : null);

  async function handleStart() {
    setError(null);
    setPreparing(true);
    log.info("connect requested");
    try {
      log.debug("fetching signed URL");
      const res = await fetch("/api/signed-url");
      if (!res.ok) {
        log.warn("signed-url fetch failed", { status: res.status });
        throw new Error("Couldn't reach the bar. Check the server is configured.");
      }
      const { signedUrl } = (await res.json()) as { signedUrl?: string };
      if (!signedUrl) {
        log.warn("signed-url response missing signedUrl");
        throw new Error("The bar didn't hand back a way in. Try again.");
      }

      const dynamicVariables = buildDynamicVariables(form);
      log.debug("signed URL acquired, starting session", {
        clientTools: Object.keys(clientTools),
        dynamicVariables: Object.keys(dynamicVariables),
      });
      startSession({
        signedUrl,
        connectionType: "websocket",
        clientTools,
        dynamicVariables,
        onConnect: ({ conversationId }) =>
          log.info("connected", { conversationId }),
        onDisconnect: (details) =>
          log.info("disconnected", { reason: details?.reason }),
        onError: (message, context) => {
          log.error("session error", { message, context });
          setError(message);
        },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Something went wrong.";
      log.error("connect failed", { reason });
      setError(reason);
    } finally {
      setPreparing(false);
    }
  }

  function handleEnd() {
    log.info("disconnect requested");
    endSession();
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p
        className="text-sm uppercase tracking-[0.2em] text-current/75"
        data-testid="status-line"
      >
        {STATUS_COPY[status] ?? status}
      </p>

      {!isActive ? (
        <>
          <PreCallForm value={form} onChange={setForm} disabled={busy} />
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="rounded-full bg-amber-400 px-8 py-3 font-semibold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "One moment…" : "Step up to the bar"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleEnd}
          className="rounded-full border border-current/30 px-8 py-3 font-semibold text-current/75 transition hover:bg-current/10 hover:text-current"
        >
          Close the tab
        </button>
      )}

      {errorText ? (
        <p className="max-w-sm text-center text-sm text-red-300" role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
