// Purpose: Provide typed API client functions and network logging for the Azure Functions backend, including base URL resolution.
// Persists: No persistence.
// Security Risks: Sends device identifiers and request IDs; avoid logging raw values or secrets.
import Constants from "expo-constants";

import type { Locale } from "./i18n";
import { createUuidV4 } from "../utils/uuid";
import { error as logError, log } from "../utils/logger";

const DEFAULT_LOCALHOST_BASE_URL = "http://localhost:7071";

function extractHost(hostUri: string): string | null {
  const trimmed = hostUri.replace(/^https?:\/\//, "").split("/")[0];
  const host = trimmed.split(":")[0]?.trim();
  return host ? host : null;
}

function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  const manifest = Constants as {
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string; debuggerHost?: string } } };
  };
  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    manifest.manifest?.debuggerHost,
    manifest.manifest2?.extra?.expoClient?.hostUri,
    manifest.manifest2?.extra?.expoClient?.debuggerHost
  ];

  for (const candidate of hostCandidates) {
    if (!candidate) {
      continue;
    }
    const host = extractHost(candidate);
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:7071`;
    }
  }

  return DEFAULT_LOCALHOST_BASE_URL;
}

const API_BASE_URL = resolveApiBaseUrl();
const FETCH_TIMEOUT_MS = 10000;

log("api", "base_url", { base_url: API_BASE_URL });

export type PortionSize = "small" | "medium" | "large";
export type YesNoNotSure = "yes" | "no" | "not_sure";

export type EstimateCalciumRequest = {
  image_base64: string;
  image_mime: "image/jpeg";
  answers: {
    portion_size: PortionSize;
    contains_dairy: YesNoNotSure;
    contains_tofu_or_small_fish_bones: YesNoNotSure;
  };
  locale: Locale;
  ui_version: string;
};

export type EstimateCalciumResponse = {
  calcium_mg: number;
  confidence: number;
  confidence_label: "high" | "medium" | "low";
  follow_up_question: string | null;
  debug: {
    model: string;
    prompt_version: string;
    request_id: string;
  };
};

export type RateLimitedError = {
  error: "rate_limited";
  retry_after_seconds: number;
};

export type TemporarilyDisabledError = {
  error: "temporarily_disabled";
  message: string;
};

export type InvalidRequestError = {
  error: "invalid_request";
  message: string;
};

export type LocalizationLatestResponse = {
  ui_version: string;
  supported_locales: Locale[];
  locale: Locale;
  pack_url: string;
};

export type SuggestionRequest = {
  category: "bug" | "feature" | "confusing";
  message: string;
  include_diagnostics: boolean;
  diagnostics?: {
    app_version?: string;
    os?: "ios" | "android";
    os_version?: string;
    device_class?: string;
    last_error_code?: string;
    last_request_id?: string;
  };
};

export type SuggestionResponse = {
  ok: true;
};

export type StatusResponse = {
  estimation_enabled: boolean;
  lockout_active: boolean;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: RateLimitedError | TemporarilyDisabledError | InvalidRequestError };

export type ApiErrorKind = "NETWORK" | "TIMEOUT" | "HTTP" | "CANCEL" | "UNKNOWN";

export class ApiClientError extends Error {
  kind: ApiErrorKind;
  messageUser: string;
  messageDev: string;
  status?: number;
  url: string;
  method: string;
  traceId: string;

  constructor(params: {
    kind: ApiErrorKind;
    messageUser: string;
    messageDev: string;
    status?: number;
    url: string;
    method: string;
    traceId: string;
  }) {
    super(params.messageDev);
    this.name = "ApiClientError";
    this.kind = params.kind;
    this.messageUser = params.messageUser;
    this.messageDev = params.messageDev;
    this.status = params.status;
    this.url = params.url;
    this.method = params.method;
    this.traceId = params.traceId;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

const appVersion = Constants.expoConfig?.version ?? "0.0.0";

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function toSafeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return rawUrl;
  }
}

function messageForKind(kind: ApiErrorKind): string {
  switch (kind) {
    case "NETWORK":
      return "Can’t reach the server right now. Check Wi-Fi and try again.";
    case "TIMEOUT":
      return "The server is taking too long to respond. Try again.";
    case "HTTP":
      return "Something went wrong on our side. Please try again.";
    case "CANCEL":
      return "The request was canceled. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function isNetworkErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror")
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function buildApiClientError(params: {
  kind: ApiErrorKind;
  messageDev: string;
  status?: number;
  url: string;
  method: string;
  traceId: string;
}): ApiClientError {
  return new ApiClientError({
    ...params,
    messageUser: messageForKind(params.kind)
  });
}

async function readResponseSnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) {
      return "empty_body";
    }
    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `unreadable_body:${message}`;
  }
}

export async function fetchWithLogging(
  rawUrl: string,
  init?: RequestInit,
  traceId?: string
): Promise<Response> {
  const method = init?.method ?? "GET";
  const safeUrl = toSafeUrl(rawUrl);
  const controller = new AbortController();
  const start = Date.now();
  let didTimeout = false;
  const resolvedTraceId = traceId ?? (await createUuidV4());

  log("net", "req", { method, url: safeUrl, request_id: resolvedTraceId });

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    log("net", "abort", { url: safeUrl, ms: FETCH_TIMEOUT_MS, request_id: resolvedTraceId });
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, {
      ...init,
      signal: controller.signal
    });
    log("net", "res", { status: response.status, ms: Date.now() - start, request_id: resolvedTraceId });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error && error.stack ? ` stack=${error.stack}` : "";
    const kind: ApiErrorKind = didTimeout
      ? "TIMEOUT"
      : isAbortError(error)
        ? "CANCEL"
        : isNetworkErrorMessage(message)
          ? "NETWORK"
          : "UNKNOWN";
    const messageDev = `${kind} error for ${method} ${safeUrl}: ${message}${stack}`;
    const apiError = buildApiClientError({
      kind,
      messageDev,
      url: safeUrl,
      method,
      traceId: resolvedTraceId
    });
    logError("net", "err", {
      kind: apiError.kind,
      url: apiError.url,
      method: apiError.method,
      status: apiError.status ?? null,
      message: apiError.messageDev,
      request_id: apiError.traceId,
      ms: Date.now() - start
    });
    throw apiError;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestJson<T>(
  rawUrl: string,
  init?: RequestInit,
  traceId?: string
): Promise<{ data: T; traceId: string }> {
  const resolvedTraceId = traceId ?? (await createUuidV4());
  const response = await fetchWithLogging(rawUrl, init, resolvedTraceId);
  const method = init?.method ?? "GET";
  const safeUrl = toSafeUrl(rawUrl);

  if (!response.ok) {
    const bodySnippet = await readResponseSnippet(response);
    const messageDev = `HTTP ${response.status} for ${method} ${safeUrl}; body=${bodySnippet}`;
    const apiError = buildApiClientError({
      kind: "HTTP",
      messageDev,
      status: response.status,
      url: safeUrl,
      method,
      traceId: resolvedTraceId
    });
    logError("net", "http_error", {
      kind: apiError.kind,
      url: apiError.url,
      method: apiError.method,
      status: apiError.status,
      message: apiError.messageDev,
      request_id: apiError.traceId
    });
    throw apiError;
  }

  return { data: (await response.json()) as T, traceId: resolvedTraceId };
}

export async function getStatus(): Promise<StatusResponse> {
  const traceId = await createUuidV4();
  const { data } = await requestJson<StatusResponse>(buildUrl("/api/status"), undefined, traceId);
  return data;
}

export async function getLocalizationLatest(locale: Locale): Promise<LocalizationLatestResponse> {
  const url = new URL(buildUrl("/api/localization/latest"));
  url.searchParams.set("locale", locale);
  const traceId = await createUuidV4();
  const { data } = await requestJson<LocalizationLatestResponse>(url.toString(), undefined, traceId);
  return data;
}

export async function estimateCalcium(
  deviceInstallId: string,
  request: EstimateCalciumRequest
): Promise<EstimateCalciumResponse> {
  const traceId = await createUuidV4();
  const { data } = await requestJson<EstimateCalciumResponse>(
    buildUrl("/api/estimateCalcium"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-install-id": deviceInstallId,
        "x-request-id": traceId,
        "x-app-version": appVersion
      },
      body: JSON.stringify(request)
    },
    traceId
  );
  return data;
}

export async function sendSuggestion(request: SuggestionRequest): Promise<ApiResult<SuggestionResponse>> {
  const traceId = await createUuidV4();
  const { data } = await requestJson<SuggestionResponse>(
    buildUrl("/api/suggestion"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    },
    traceId
  );
  return { ok: true, data };
}
