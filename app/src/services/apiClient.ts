// Purpose: Provide typed API client functions and network logging for the Azure Functions backend.
// Persists: No persistence.
// Security Risks: Sends device identifiers and request IDs; avoid logging raw values or secrets.
import Constants from "expo-constants";
import { v4 as uuidv4 } from "uuid";

import type { Locale } from "./i18n";
import { log } from "../utils/logger";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:7071";
const FETCH_TIMEOUT_MS = 10000;

log("net", "base_url", { base_url: API_BASE_URL });

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

export async function fetchWithLogging(
  rawUrl: string,
  init?: RequestInit,
  requestId?: string
): Promise<Response> {
  const method = init?.method ?? "GET";
  const safeUrl = toSafeUrl(rawUrl);
  const controller = new AbortController();
  const start = Date.now();

  log("net", "req", { method, url: safeUrl, request_id: requestId });

  const timeoutId = setTimeout(() => {
    log("net", "abort", { url: safeUrl, ms: FETCH_TIMEOUT_MS, request_id: requestId });
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, {
      ...init,
      signal: controller.signal
    });
    log("net", "res", { status: response.status, ms: Date.now() - start, request_id: requestId });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("net", "err", { message, ms: Date.now() - start, request_id: requestId });
    console.error(error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getStatus(): Promise<StatusResponse> {
  const response = await fetchWithLogging(buildUrl("/api/status"));
  if (!response.ok) {
    throw new Error("Status request failed");
  }
  return (await response.json()) as StatusResponse;
}

export async function getLocalizationLatest(locale: Locale): Promise<LocalizationLatestResponse> {
  const url = new URL(buildUrl("/api/localization/latest"));
  url.searchParams.set("locale", locale);
  const response = await fetchWithLogging(url.toString());
  if (!response.ok) {
    throw new Error("Localization request failed");
  }
  return (await response.json()) as LocalizationLatestResponse;
}

export async function estimateCalcium(
  deviceInstallId: string,
  request: EstimateCalciumRequest
): Promise<ApiResult<EstimateCalciumResponse>> {
  const requestId = uuidv4();
  const response = await fetchWithLogging(
    buildUrl("/api/estimateCalcium"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-install-id": deviceInstallId,
        "x-request-id": requestId,
        "x-app-version": appVersion
      },
      body: JSON.stringify(request)
    },
    requestId
  );

  if (response.ok) {
    const data = (await response.json()) as EstimateCalciumResponse;
    return { ok: true, data };
  }

  const error = (await response.json()) as RateLimitedError | TemporarilyDisabledError | InvalidRequestError;
  return { ok: false, status: response.status, error };
}

export async function sendSuggestion(request: SuggestionRequest): Promise<ApiResult<SuggestionResponse>> {
  const response = await fetchWithLogging(
    buildUrl("/api/suggestion"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    }
  );

  if (response.ok) {
    const data = (await response.json()) as SuggestionResponse;
    return { ok: true, data };
  }

  const error = (await response.json()) as RateLimitedError | TemporarilyDisabledError | InvalidRequestError;
  return { ok: false, status: response.status, error };
}
