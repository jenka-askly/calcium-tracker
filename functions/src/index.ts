// Purpose: Define Azure Functions HTTP endpoints matching the API contract schemas.
// Persists: No persistence (stub responses only).
// Security Risks: Handles request IDs and device identifiers; avoid logging raw values.
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import crypto from "crypto";

type Locale = "en" | "zh-Hans" | "es";
type SuggestionCategory = "bug" | "feature" | "confusing";

const ESTIMATION_ENABLED = process.env.ESTIMATION_ENABLED !== "false";
const LOCKOUT_ACTIVE = process.env.LOCKOUT_ACTIVE === "true";
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== "false";
const CIRCUIT_BREAKER_ENABLED = process.env.CIRCUIT_BREAKER_ENABLED !== "false";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "changeme";
const DEVICE_HASH_SALT = process.env.DEVICE_HASH_SALT ?? "local-dev-salt";
const LOCALIZATION_PACK_URL_BASE = process.env.LOCALIZATION_PACK_URL_BASE ?? "http://localhost:7071/locales";

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

    if (!deviceInstallId || !requestId || !appVersion) {
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

    const body = await parseJson<Record<string, unknown>>(request);
    if (!body) {
      return invalidRequest("Invalid JSON body.");
    }

    const response = {
      calcium_mg: 300,
      confidence: 0.6,
      confidence_label: "medium",
      follow_up_question: null,
      debug: {
        model: "mock-model",
        prompt_version: "estimateCalcium_v1",
        request_id: requestId
      }
    };

    logEvent(context, "estimate_request_completed", {
      request_id: requestId,
      device_install_id_hash: hashDeviceInstallId(deviceInstallId),
      result: "mock_success"
    });

    return {
      status: 200,
      jsonBody: response
    };
  }
});

app.http("localizationLatest", {
  methods: ["GET"],
  route: "localization/latest",
  handler: async (request, context) => {
    const locale = request.query.get("locale") as Locale | null;
    if (!locale || !["en", "zh-Hans", "es"].includes(locale)) {
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
        supported_locales: ["en", "zh-Hans", "es"],
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

    const body = await parseJson<{ ui_version: string; locales: Locale[] }>(request);
    if (!body) {
      return invalidRequest("Invalid JSON body.");
    }

    logEvent(context, "localization_regenerate", {
      ui_version: body.ui_version,
      locales_count: body.locales?.length ?? 0
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
        ui_version: body.ui_version ?? "mock-ui-version",
        generated: body.locales ?? [],
        warnings: []
      }
    };
  }
});

app.http("suggestion", {
  methods: ["POST"],
  route: "suggestion",
  handler: async (request, context) => {
    const body = await parseJson<{ category?: SuggestionCategory }>(request);
    if (!body?.category) {
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
