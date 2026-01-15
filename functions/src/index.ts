// Purpose: Define Azure Functions HTTP endpoints matching the API contract schemas.
// Persists: No persistence.
// Security Risks: Handles request IDs, device identifiers, and OpenAI API calls; avoid logging raw values.
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import crypto from "crypto";

import { EstimateError, isEstimateError } from "./services/errors";
import {
  PROMPT_VERSION,
  estimateCalcium,
  getConfig
} from "./services/estimateCalciumService";

type Locale = "en" | "zh-Hans" | "es";
type SuggestionCategory = "bug" | "feature" | "confusing";
type PortionSize = "small" | "medium" | "large";
type YesNoNotSure = "yes" | "no" | "not_sure";

type EstimateCalciumRequest = {
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

type SuggestionRequest = {
  category: SuggestionCategory;
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

type LocalizationRegenerateRequest = {
  ui_version: string;
  base_en_json: Record<string, string>;
  locales: Locale[];
};

const ESTIMATION_ENABLED = process.env.ESTIMATION_ENABLED !== "false";
const LOCKOUT_ACTIVE = process.env.LOCKOUT_ACTIVE === "true";
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== "false";
const CIRCUIT_BREAKER_ENABLED = process.env.CIRCUIT_BREAKER_ENABLED !== "false";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "changeme";
const DEVICE_HASH_SALT = process.env.DEVICE_HASH_SALT ?? "local-dev-salt";
const LOCALIZATION_PACK_URL_BASE = process.env.LOCALIZATION_PACK_URL_BASE ?? "http://localhost:7071/locales";

const SUPPORTED_LOCALES: Locale[] = ["en", "zh-Hans", "es"];
const PORTION_SIZES: PortionSize[] = ["small", "medium", "large"];
const YES_NO_NOT_SURE_VALUES: YesNoNotSure[] = ["yes", "no", "not_sure"];
const SUGGESTION_CATEGORIES: SuggestionCategory[] = ["bug", "feature", "confusing"];

function hashDeviceInstallId(deviceInstallId: string): string {
  return crypto.createHash("sha256").update(`${DEVICE_HASH_SALT}:${deviceInstallId}`).digest("hex");
}

function logEvent(context: InvocationContext, event: string, payload: Record<string, unknown>) {
  context.log({
    event,
    timestamp_utc: new Date().toISOString(),
    ...payload
  });
}

function getHeader(request: HttpRequest, name: string): string | undefined {
  return request.headers.get(name) ?? undefined;
}

function invalidRequest(message: string): HttpResponseInit {
  return {
    status: 400,
    jsonBody: {
      error: "invalid_request",
      message
    }
  };
}

function errorResponse(status: number, error: string, message: string, requestId: string): HttpResponseInit {
  return {
    status,
    jsonBody: {
      error,
      message,
      request_id: requestId
    }
  };
}

function rateLimited(): HttpResponseInit {
  return {
    status: 429,
    jsonBody: {
      error: "rate_limited",
      retry_after_seconds: 60
    }
  };
}

function temporarilyDisabled(message: string): HttpResponseInit {
  return {
    status: 503,
    jsonBody: {
      error: "temporarily_disabled",
      message
    }
  };
}

async function parseJson<T>(request: HttpRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function isRateLimited(): boolean {
  return false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLocale(value: unknown): value is Locale {
  return isNonEmptyString(value) && SUPPORTED_LOCALES.includes(value as Locale);
}

function isPortionSize(value: unknown): value is PortionSize {
  return isNonEmptyString(value) && PORTION_SIZES.includes(value as PortionSize);
}

function isYesNoNotSure(value: unknown): value is YesNoNotSure {
  return isNonEmptyString(value) && YES_NO_NOT_SURE_VALUES.includes(value as YesNoNotSure);
}

function isSuggestionCategory(value: unknown): value is SuggestionCategory {
  return isNonEmptyString(value) && SUGGESTION_CATEGORIES.includes(value as SuggestionCategory);
}

function isEstimateCalciumRequest(value: unknown): value is EstimateCalciumRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as EstimateCalciumRequest;
  if (!isNonEmptyString(body.image_base64) || body.image_mime !== "image/jpeg") {
    return false;
  }

  if (!body.answers || typeof body.answers !== "object") {
    return false;
  }

  const { portion_size, contains_dairy, contains_tofu_or_small_fish_bones } = body.answers;
  if (!isPortionSize(portion_size) || !isYesNoNotSure(contains_dairy) || !isYesNoNotSure(contains_tofu_or_small_fish_bones)) {
    return false;
  }

  if (!isLocale(body.locale) || !isNonEmptyString(body.ui_version)) {
    return false;
  }

  return true;
}

function isSuggestionRequest(value: unknown): value is SuggestionRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as SuggestionRequest;
  if (!isSuggestionCategory(body.category) || !isNonEmptyString(body.message) || typeof body.include_diagnostics !== "boolean") {
    return false;
  }

  if (body.message.length > 500) {
    return false;
  }

  if (body.include_diagnostics) {
    return Boolean(body.diagnostics && typeof body.diagnostics === "object");
  }

  return true;
}

function isLocalizationRegenerateRequest(value: unknown): value is LocalizationRegenerateRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as LocalizationRegenerateRequest;
  if (!isNonEmptyString(body.ui_version) || !body.base_en_json || typeof body.base_en_json !== "object") {
    return false;
  }

  if (!Array.isArray(body.locales) || body.locales.length === 0 || body.locales.some((locale) => !isLocale(locale))) {
    return false;
  }

  return true;
}

app.http("status", {
  methods: ["GET"],
  route: "status",
  handler: async (_request, context) => {
    logEvent(context, "status_check", {
      estimation_enabled: ESTIMATION_ENABLED,
      lockout_active: LOCKOUT_ACTIVE,
      rate_limit_enabled: RATE_LIMIT_ENABLED,
      circuit_breaker_enabled: CIRCUIT_BREAKER_ENABLED
    });
    return {
      status: 200,
      jsonBody: {
        estimation_enabled: ESTIMATION_ENABLED && !LOCKOUT_ACTIVE,
        lockout_active: LOCKOUT_ACTIVE,
        message: ESTIMATION_ENABLED && !LOCKOUT_ACTIVE ? "OK" : "Estimation temporarily unavailable."
      }
    };
  }
});

app.http("estimateCalcium", {
  methods: ["POST"],
  route: "estimateCalcium",
  handler: async (request, context) => {
    const deviceInstallId = getHeader(request, "x-device-install-id");
    const requestId = getHeader(request, "x-request-id");
    const appVersion = getHeader(request, "x-app-version");
    const debugHeader = getHeader(request, "x-debug");
    const includeDebug = process.env.NODE_ENV !== "production" || debugHeader === "1";

    if (!isNonEmptyString(deviceInstallId) || !isNonEmptyString(requestId) || !isNonEmptyString(appVersion)) {
      return invalidRequest("Missing required headers.");
    }

    logEvent(context, "estimate_request_received", {
      request_id: requestId,
      device_install_id_hash: hashDeviceInstallId(deviceInstallId),
      app_version: appVersion,
      rate_limit_enabled: RATE_LIMIT_ENABLED,
      circuit_breaker_enabled: CIRCUIT_BREAKER_ENABLED
    });

    if (CIRCUIT_BREAKER_ENABLED && !ESTIMATION_ENABLED) {
      return temporarilyDisabled("Estimation temporarily unavailable.");
    }

    if (LOCKOUT_ACTIVE) {
      return temporarilyDisabled("Estimation temporarily unavailable.");
    }

    if (RATE_LIMIT_ENABLED && isRateLimited()) {
      return rateLimited();
    }

    const body = await parseJson<EstimateCalciumRequest>(request);
    if (!body || !isEstimateCalciumRequest(body)) {
      return invalidRequest("Invalid JSON body.");
    }

    const config = getConfig();
    const mode = config.useMock ? "mock" : "openai";

    logEvent(context, "estimate_mode_select", {
      request_id: requestId,
      mode,
      has_openai_key: config.apiKeyPresent,
      model: config.model
    });

    if (!config.useMock && !config.apiKeyPresent) {
      return errorResponse(
        500,
        "server_not_configured",
        "Estimator is not configured. Please contact support.",
        requestId
      );
    }

    try {
      const result = await estimateCalcium({
        imageBase64: body.image_base64,
        answers: body.answers,
        locale: body.locale,
        requestId,
        logger: (event, payload) => logEvent(context, event, payload),
        config
      });

      return {
        status: 200,
        jsonBody: {
          ...result,
          follow_up_question: null,
          debug: includeDebug
            ? {
                model: config.model,
                prompt_version: PROMPT_VERSION,
                request_id: requestId,
                mode
              }
            : { request_id: requestId }
        }
      };
    } catch (error) {
      if (isEstimateError(error)) {
        const errorMessage =
          error.code === "model_invalid_response"
            ? "Estimator returned an invalid response. Please try again."
            : error.code === "upstream_timeout"
              ? "Estimator timed out. Please try again."
              : "Estimator is temporarily unavailable. Please try again.";

        const status = error.code === "upstream_timeout" ? 504 : 502;
        return errorResponse(status, error.code, errorMessage, requestId);
      }

      const fallbackError = new EstimateError("upstream_unavailable", "Unhandled estimate error.", error);
      return errorResponse(502, fallbackError.code, "Estimator is temporarily unavailable. Please try again.", requestId);
    }
  }
});

app.http("localizationLatest", {
  methods: ["GET"],
  route: "localization/latest",
  handler: async (request, context) => {
    const locale = request.query.get("locale");
    if (!isLocale(locale)) {
      return invalidRequest("Unsupported locale.");
    }

    logEvent(context, "localization_latest", {
      locale,
      rate_limit_enabled: RATE_LIMIT_ENABLED
    });

    if (RATE_LIMIT_ENABLED && isRateLimited()) {
      return rateLimited();
    }

    if (CIRCUIT_BREAKER_ENABLED && !ESTIMATION_ENABLED) {
      return temporarilyDisabled("Localization temporarily unavailable.");
    }

    return {
      status: 200,
      jsonBody: {
        ui_version: "mock-ui-version",
        supported_locales: SUPPORTED_LOCALES,
        locale,
        pack_url: `${LOCALIZATION_PACK_URL_BASE}/${locale}.json`
      }
    };
  }
});

app.http("localizationRegenerate", {
  methods: ["POST"],
  route: "localization/regenerate",
  handler: async (request, context) => {
    const adminKey = getHeader(request, "x-admin-key");
    if (adminKey !== ADMIN_KEY) {
      return invalidRequest("Unauthorized.");
    }

    const body = await parseJson<LocalizationRegenerateRequest>(request);
    if (!body || !isLocalizationRegenerateRequest(body)) {
      return invalidRequest("Invalid JSON body.");
    }

    logEvent(context, "localization_regenerate", {
      ui_version: body.ui_version,
      locales_count: body.locales.length
    });

    if (RATE_LIMIT_ENABLED && isRateLimited()) {
      return rateLimited();
    }

    if (CIRCUIT_BREAKER_ENABLED && !ESTIMATION_ENABLED) {
      return temporarilyDisabled("Localization temporarily unavailable.");
    }

    return {
      status: 200,
      jsonBody: {
        ui_version: body.ui_version,
        generated: body.locales,
        warnings: []
      }
    };
  }
});

app.http("suggestion", {
  methods: ["POST"],
  route: "suggestion",
  handler: async (request, context) => {
    const body = await parseJson<SuggestionRequest>(request);
    if (!body || !isSuggestionRequest(body)) {
      return invalidRequest("Invalid suggestion payload.");
    }

    logEvent(context, "suggestion_received", {
      category: body.category,
      rate_limit_enabled: RATE_LIMIT_ENABLED
    });

    if (RATE_LIMIT_ENABLED && isRateLimited()) {
      return rateLimited();
    }

    if (CIRCUIT_BREAKER_ENABLED && !ESTIMATION_ENABLED) {
      return temporarilyDisabled("Suggestions temporarily unavailable.");
    }

    return {
      status: 200,
      jsonBody: {
        ok: true
      }
    };
  }
});
