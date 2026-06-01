/**
 * Small, leveled logger for tracing the app workflow on the developer side.
 *
 * Goals: enough signal to see *where* in the flow something failed, without
 * being noisy or leaking secrets. Works on both the server (logs to the Next.js
 * terminal) and the client (logs to the browser console).
 *
 * Levels:
 *   debug — fine-grained routine steps; OFF by default, ON in development or via
 *           NEXT_PUBLIC_LOG_DEBUG / LOG_DEBUG = "1" | "true".
 *   info  — major lifecycle milestones (always shown).
 *   warn  — recoverable / expected problems (always shown).
 *   error — failures (always shown).
 *
 * Never pass secrets as the message or meta. Use redact() for URLs/tokens.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
}

/** Whether debug-level logs should be emitted in the current environment. */
function debugEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_LOG_DEBUG ?? process.env.LOG_DEBUG;
  if (flag != null && flag !== "") {
    return flag === "1" || flag.toLowerCase() === "true";
  }
  // Default: on in local development, off in production and during tests.
  return process.env.NODE_ENV === "development";
}

const CONSOLE_FN: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: (...a) => console.debug(...a),
  info: (...a) => console.info(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

/**
 * Creates a logger namespaced to a workflow scope, e.g. "signed-url" or "widget".
 * Output looks like: `[last-call:widget] connect requested { ... }`
 */
export function createLogger(scope: string): Logger {
  const emit = (level: LogLevel, message: string, meta?: unknown) => {
    if (level === "debug" && !debugEnabled()) return;
    const line = `[last-call:${scope}] ${message}`;
    if (meta !== undefined) {
      CONSOLE_FN[level](line, meta);
    } else {
      CONSOLE_FN[level](line);
    }
  };

  return {
    debug: (message, meta) => emit("debug", message, meta),
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta),
  };
}

/**
 * Redacts a secret-bearing string (signed URL, token) for safe logging — keeps
 * just enough of the head to correlate logs, hides the rest.
 */
export function redact(value: string | undefined | null, keep = 24): string {
  if (!value) return "<none>";
  if (value.length <= keep) return "<redacted>";
  return `${value.slice(0, keep)}…<redacted ${value.length - keep} chars>`;
}
