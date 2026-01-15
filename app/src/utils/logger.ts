// Purpose: Provide structured JSON logging helpers for runtime diagnostics and timing.
// Persists: No persistence.
// Security Risks: Emits runtime metadata to console; avoid secrets or PII in payloads.

type LogPayload = {
  ts: string;
  scope: string;
  event: string;
  ms?: number;
  data?: unknown;
};

const PREFIX = "[calcium-tracker]";

type LogLevel = "log" | "warn" | "error";

function buildPayload(scope: string, event: string, data?: unknown): LogPayload {
  const base = {
    ts: new Date().toISOString(),
    scope,
    event
  };

  if (data === undefined) {
    return base;
  }

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const { ms, ...rest } = data as Record<string, unknown>;
    if (typeof ms === "number") {
      if (Object.keys(rest).length === 0) {
        return { ...base, ms };
      }
      return { ...base, ms, data: rest };
    }
  }

  return { ...base, data };
}

function emit(level: LogLevel, payload: LogPayload): void {
  const line = `${PREFIX} ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function log(scope: string, event: string, data?: unknown): void {
  emit("log", buildPayload(scope, event, data));
}

export function error(scope: string, event: string, data?: unknown): void {
  emit("error", buildPayload(scope, event, data));
}

export async function span<T>(scope: string, event: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  emit("log", buildPayload(scope, `${event}:start`));
  try {
    const result = await fn();
    emit("log", buildPayload(scope, `${event}:success`, { ms: Date.now() - start }));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit("error", buildPayload(scope, `${event}:error`, { ms: Date.now() - start, message }));
    throw error;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      emit("warn", buildPayload("timeout", "expired", { ms, label }));
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}
