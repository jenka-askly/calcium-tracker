// Purpose: Define Azure Functions HTTP endpoints matching the API contract schemas with safe config logging and diagnostics.
// Persists: No persistence.
// Security Risks: Handles request IDs, device identifiers, admin keys, and OpenAI API calls; avoid logging raw values.
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import crypto from "crypto";

import { buildEnvReport, getDerivedConfig } from "./env";
import { EstimateError, isEstimateError } from "./services/errors";
import {
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

const SUPPORTED_LOCALES: Locale[] = ["en", "zh-Hans", "es"];
const PORTION_SIZES: PortionSize[] = ["small", "medium", "large"];
const YES_NO_NOT_SURE_VALUES: YesNoNotSure[] = ["yes", "no", "not_sure"];
const SUGGESTION_CATEGORIES: SuggestionCategory[] = ["bug", "feature", "confusing"];

const startupEnvReport = buildEnvReport(getDerivedConfig());
console.log({
  event: "env_snapshot_startup",
  timestamp_utc: new Date().toISOString(),
  snapshot: startupEnvReport.snapshot,
  missing_required: startupEnvReport.missing_required
});

function hashDeviceInstallId(deviceInstallId: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${deviceInstallId}`).digest("hex");
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

function invalidRequest(message: string, requestId?: string): HttpResponseInit {
  return {
    status: 400,
    jsonBody: {
      error: "invalid_request",
      message,
      ...(requestId ? { request_id: requestId } : {})
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

function rateLimited(requestId?: string): HttpResponseInit {
  return {
    status: 429,
    jsonBody: {
      error: "rate_limited",
      retry_after_seconds: 60,
      ...(requestId ? { request_id: requestId } : {})
    }
  };
}

function temporarilyDisabled(message: string, requestId?: string): HttpResponseInit {
  return {
    status: 503,
    jsonBody: {
      error: "temporarily_disabled",
      message,
      ...(requestId ? { request_id: requestId } : {})
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

function isDebugMode(request: HttpRequest): boolean {
  return process.env.NODE_ENV !== "production" || getHeader(request, "x-debug") === "1";
}

function logEnvSnapshot(context: InvocationContext, snapshot: Record<string, unknown>, requestId?: string) {
  logEvent(context, "env_snapshot", {
    ...(requestId ? { request_id: requestId } : {}),
    snapshot
  });
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
    const derivedConfig = getDerivedConfig();
    const envReport = buildEnvReport(derivedConfig);
    logEnvSnapshot(context, envReport.snapshot);
    logEvent(context, "status_check", {
      estimation_enabled: derivedConfig.estimationEnabled,
      lockout_active: derivedConfig.lockoutActive,
      rate_limit_enabled: derivedConfig.rateLimitEnabled,
      circuit_breaker_enabled: derivedConfig.circuitBreakerEnabled
    });
    return {
      status: 200,
      jsonBody: {
        estimation_enabled: derivedConfig.estimationEnabled && !derivedConfig.lockoutActive,
        lockout_active: derivedConfig.lockoutActive,
        message: derivedConfig.estimationEnabled && !derivedConfig.lockoutActive ? "OK" : "Estimation temporarily unavailable."
      }
    };
  }
});

app.http("diagnosticsEnv", {
  methods: ["GET"],
  route: "diagnostics/env",
  handler: async (request, context) => {
    const derivedConfig = getDerivedConfig();
    const envReport = buildEnvReport(derivedConfig);
    const requestId = getHeader(request, "x-request-id");
    const adminKey = getHeader(request, "x-admin-key");
    const isAdmin = adminKey === derivedConfig.adminKey;

    logEnvSnapshot(context, envReport.snapshot, requestId);

    const minimalRequired = envReport.required.map((item) => ({ name: item.name, present: item.present }));
    const minimalOptional = envReport.optional.map((item) => ({ name: item.name, present: item.present }));
    const responseBody: Record<string, unknown> = {
      required: minimalRequired,
      optional: minimalOptional,
      missing_required: envReport.missing_required,
      derived: {
        estimation_enabled: derivedConfig.estimationEnabled,
        lockout_active: derivedConfig.lockoutActive,
        rate_limit_enabled: derivedConfig.rateLimitEnabled,
        circuit_breaker_enabled: derivedConfig.circuitBreakerEnabled,
        estimation_available: derivedConfig.estimationEnabled && !derivedConfig.lockoutActive,
        use_mock_estimate: derivedConfig.useMockEstimate,
        openai_model: derivedConfig.openaiModel,
        openai_base_url: derivedConfig.openaiBaseUrl ?? null,
        openai_timeout_ms: derivedConfig.openaiTimeoutMs,
        estimator_prompt_version: derivedConfig.estimatorPromptVersion,
        estimator_prompt_present: Boolean(derivedConfig.estimatorPrompt)
      },
      node_version: process.version,
      platform: process.platform,
      timestamp_utc: new Date().toISOString()
    };

    if (isAdmin) {
      responseBody.snapshot = envReport.snapshot;
    }

    return {
      status: 200,
      jsonBody: responseBody
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
    const debugMode = isDebugMode(request);
    const derivedConfig = getDerivedConfig();
    const config = getConfig();
    const envReport = buildEnvReport(derivedConfig);
    const configSnapshot = {
      has_openai_key: Boolean(process.env.OPENAI_API_KEY),
      openai_model: derivedConfig.openaiModel,
      estimate_mode: derivedConfig.estimateMode,
      use_mock_estimate: derivedConfig.useMockEstimate,
      estimation_enabled: derivedConfig.estimationEnabled,
      lockout_active: derivedConfig.lockoutActive,
      rate_limit_enabled: derivedConfig.rateLimitEnabled,
      circuit_breaker_enabled: derivedConfig.circuitBreakerEnabled
    };

    logEvent(context, "estimate_mode_config", {
      ...(isNonEmptyString(requestId) ? { request_id: requestId } : {}),
      use_mock: config.useMock,
      has_openai_key: config.apiKeyPresent,
      model: config.model,
      prompt_version: config.promptVersion
    });

    logEnvSnapshot(context, envReport.snapshot, requestId);
    if (isNonEmptyString(requestId)) {
      logEvent(context, "env_check", {
        request_id: requestId,
        missing_required: envReport.missing_required,
        present_required: envReport.required.filter((item) => item.present).map((item) => item.name)
      });
    }

    if (!isNonEmptyString(deviceInstallId) || !isNonEmptyString(requestId) || !isNonEmptyString(appVersion)) {
      return invalidRequest("Missing required headers.", requestId);
    }

    logEvent(context, "estimate_config", {
      request_id: requestId,
      ...configSnapshot
    });

    logEvent(context, "estimate_request_received", {
      request_id: requestId,
      device_install_id_hash: hashDeviceInstallId(deviceInstallId, derivedConfig.deviceHashSalt),
      app_version: appVersion,
      rate_limit_enabled: derivedConfig.rateLimitEnabled,
      circuit_breaker_enabled: derivedConfig.circuitBreakerEnabled
    });

    if (derivedConfig.circuitBreakerEnabled && !derivedConfig.estimationEnabled) {
      return temporarilyDisabled("Estimation temporarily unavailable.", requestId);
    }

    if (derivedConfig.lockoutActive) {
      return temporarilyDisabled("Estimation temporarily unavailable.", requestId);
    }

    if (derivedConfig.rateLimitEnabled && isRateLimited()) {
      return rateLimited(requestId);
    }

    if (envReport.missing_required.length > 0) {
      logEvent(context, "estimate_blocked_missing_env", {
        request_id: requestId,
        missing_required: envReport.missing_required
      });
      return {
        status: 502,
        jsonBody: {
          error: "upstream_unavailable",
          message: "Estimator is not configured.",
          missing_env: envReport.missing_required,
          request_id: requestId
        }
      };
    }

    const body = await parseJson<EstimateCalciumRequest>(request);
    if (!body || !isEstimateCalciumRequest(body)) {
      return invalidRequest("Invalid JSON body.", requestId);
    }

    const mode = config.useMock ? "mock" : "openai";

    logEvent(context, "estimate_mode_select", {
      request_id: requestId,
      mode,
      has_openai_key: config.apiKeyPresent,
      model: config.model
    });

    try {
      const outcome = await estimateCalcium({
        imageBase64: body.image_base64,
        answers: body.answers,
        locale: body.locale,
        requestId,
        logger: (event, payload) => logEvent(context, event, payload),
        config
      });

      if (mode === "openai") {
        const rawTextLength = outcome.rawText ? outcome.rawText.length : 0;
        logEvent(context, "estimate_openai_raw_text_present", {
          request_id: requestId,
          present: rawTextLength > 0,
          length: rawTextLength
        });
        logEvent(context, "estimate_openai_parsed_result", {
          request_id: requestId,
          calcium_mg: outcome.result.calcium_mg,
          confidence: outcome.result.confidence,
          confidence_label: outcome.result.confidence_label
        });
      }

      logEvent(context, "estimate_response_sent", {
        request_id: requestId,
        calcium_mg: outcome.result.calcium_mg,
        confidence: outcome.result.confidence,
        confidence_label: outcome.result.confidence_label
      });

      logEvent(context, "estimate_http_response", {
        request_id: requestId,
        calcium_mg: outcome.result.calcium_mg,
        confidence_label: outcome.result.confidence_label
      });

      return {
        status: 200,
        jsonBody: {
          ...outcome.result,
          follow_up_question: null,
          ...(debugMode
            ? {
                debug: {
                  model: config.model,
                  latency_ms: outcome.latencyMs,
                  request_id: requestId
                }
              }
            : {})
        }
      };
    } catch (error) {
      if (isEstimateError(error)) {
        if (error.code === "model_invalid_response") {
          logEvent(context, "estimate_openai_parse_failed", {
            request_id: requestId,
            message: error.message
          });
          return errorResponse(502, error.code, "Model returned invalid JSON", requestId);
        }

        const errorMessage =
          error.code === "upstream_timeout"
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
    const derivedConfig = getDerivedConfig();
    const envReport = buildEnvReport(derivedConfig);
    const requestId = getHeader(request, "x-request-id");
    logEnvSnapshot(context, envReport.snapshot, requestId);
    const locale = request.query.get("locale");
    if (!isLocale(locale)) {
      return invalidRequest("Unsupported locale.");
    }

    logEvent(context, "localization_latest", {
      locale,
      rate_limit_enabled: derivedConfig.rateLimitEnabled
    });

    if (derivedConfig.rateLimitEnabled && isRateLimited()) {
      return rateLimited();
    }

    if (derivedConfig.circuitBreakerEnabled && !derivedConfig.estimationEnabled) {
      return temporarilyDisabled("Localization temporarily unavailable.");
    }

    return {
      status: 200,
      jsonBody: {
        ui_version: "mock-ui-version",
        supported_locales: SUPPORTED_LOCALES,
        locale,
        pack_url: `${derivedConfig.localizationPackUrlBase}/${locale}.json`
      }
    };
  }
});

app.http("localizationRegenerate", {
  methods: ["POST"],
  route: "localization/regenerate",
  handler: async (request, context) => {
    const derivedConfig = getDerivedConfig();
    const envReport = buildEnvReport(derivedConfig);
    const requestId = getHeader(request, "x-request-id");
    logEnvSnapshot(context, envReport.snapshot, requestId);
    const adminKey = getHeader(request, "x-admin-key");
    if (adminKey !== derivedConfig.adminKey) {
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

    if (derivedConfig.rateLimitEnabled && isRateLimited()) {
      return rateLimited();
    }

    if (derivedConfig.circuitBreakerEnabled && !derivedConfig.estimationEnabled) {
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
    const derivedConfig = getDerivedConfig();
    const envReport = buildEnvReport(derivedConfig);
    const requestId = getHeader(request, "x-request-id");
    logEnvSnapshot(context, envReport.snapshot, requestId);
    const body = await parseJson<SuggestionRequest>(request);
    if (!body || !isSuggestionRequest(body)) {
      return invalidRequest("Invalid suggestion payload.");
    }

    logEvent(context, "suggestion_received", {
      category: body.category,
      rate_limit_enabled: derivedConfig.rateLimitEnabled
    });

    if (derivedConfig.rateLimitEnabled && isRateLimited()) {
      return rateLimited();
    }

    if (derivedConfig.circuitBreakerEnabled && !derivedConfig.estimationEnabled) {
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
