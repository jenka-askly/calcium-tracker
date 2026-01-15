// Purpose: Centralize environment variable specifications, derived config values, and sanitized diagnostics snapshots.
// Persists: No persistence.
// Security Risks: Handles secret-bearing environment variables; only expose hashed or truncated values.
import crypto from "crypto";

export type DerivedConfig = {
  estimationEnabled: boolean;
  lockoutActive: boolean;
  rateLimitEnabled: boolean;
  circuitBreakerEnabled: boolean;
  adminKey: string;
  deviceHashSalt: string;
  localizationPackUrlBase: string;
  useMockEstimate: boolean;
  openaiModel: string;
  openaiBaseUrl?: string;
  openaiTimeoutMs: number;
  estimatorPromptVersion: string;
  estimatorPrompt?: string;
};

export type EnvSpec = {
  name: string;
  requiredWhen: (cfg: DerivedConfig) => boolean;
  isSecret: boolean;
  defaultValue?: string;
  description: string;
};

export type EnvStatus = {
  name: string;
  present: boolean;
  required: boolean;
  defaultValue?: string;
  description: string;
};

export type EnvSnapshotEntry =
  | { present: false }
  | { present: true; length: number; sha256_8: string }
  | { present: true; value: string };

export type EnvReport = {
  required: EnvStatus[];
  optional: EnvStatus[];
  missing_required: string[];
  snapshot: Record<string, EnvSnapshotEntry>;
};

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 45000;
const DEFAULT_PROMPT_VERSION = "estimateCalcium_v1";

function isPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function truncateValue(value: string, maxLength = 120): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…`;
}

function sha256_8(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function parseTimeoutMs(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_OPENAI_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_OPENAI_TIMEOUT_MS;
}

export function getDerivedConfig(): DerivedConfig {
  const estimationEnabled = process.env.ESTIMATION_ENABLED !== "false";
  const lockoutActive = process.env.LOCKOUT_ACTIVE === "true";
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";
  const circuitBreakerEnabled = process.env.CIRCUIT_BREAKER_ENABLED !== "false";
  const adminKey = process.env.ADMIN_KEY ?? "changeme";
  const deviceHashSalt = process.env.DEVICE_HASH_SALT ?? "local-dev-salt";
  const localizationPackUrlBase = process.env.LOCALIZATION_PACK_URL_BASE ?? "http://localhost:7071/locales";
  const useMockEstimate = (process.env.USE_MOCK_ESTIMATE ?? "false").toLowerCase() === "true";
  const openaiModel = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const openaiBaseUrl = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const openaiTimeoutMs = parseTimeoutMs(process.env.OPENAI_TIMEOUT_MS);
  const estimatorPromptVersion = process.env.ESTIMATOR_PROMPT_VERSION?.trim() || DEFAULT_PROMPT_VERSION;
  const estimatorPrompt = process.env.ESTIMATOR_PROMPT?.trim() || undefined;

  return {
    estimationEnabled,
    lockoutActive,
    rateLimitEnabled,
    circuitBreakerEnabled,
    adminKey,
    deviceHashSalt,
    localizationPackUrlBase,
    useMockEstimate,
    openaiModel,
    openaiBaseUrl,
    openaiTimeoutMs,
    estimatorPromptVersion,
    estimatorPrompt
  };
}

export function getEnvSpec(): EnvSpec[] {
  return [
    {
      name: "ESTIMATION_ENABLED",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: "true",
      description: "Enable estimation globally (defaults to true unless set to false)."
    },
    {
      name: "LOCKOUT_ACTIVE",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: "false",
      description: "Force-disable estimation regardless of other settings."
    },
    {
      name: "RATE_LIMIT_ENABLED",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: "true",
      description: "Enable per-request rate limiting."
    },
    {
      name: "CIRCUIT_BREAKER_ENABLED",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: "true",
      description: "Enable circuit breaker for disabling estimation."
    },
    {
      name: "ADMIN_KEY",
      requiredWhen: () => false,
      isSecret: true,
      defaultValue: "changeme",
      description: "Admin key required for privileged diagnostic endpoints."
    },
    {
      name: "DEVICE_HASH_SALT",
      requiredWhen: () => false,
      isSecret: true,
      defaultValue: "local-dev-salt",
      description: "Salt used for hashing device install IDs."
    },
    {
      name: "LOCALIZATION_PACK_URL_BASE",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: "http://localhost:7071/locales",
      description: "Base URL for localization packs."
    },
    {
      name: "USE_MOCK_ESTIMATE",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: "false",
      description: "Use mock estimation responses instead of OpenAI."
    },
    {
      name: "OPENAI_API_KEY",
      requiredWhen: (cfg) => cfg.estimationEnabled && !cfg.lockoutActive && !cfg.useMockEstimate,
      isSecret: true,
      description: "OpenAI API key used for live estimation."
    },
    {
      name: "OPENAI_MODEL",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: DEFAULT_OPENAI_MODEL,
      description: "OpenAI model name used for estimation."
    },
    {
      name: "OPENAI_BASE_URL",
      requiredWhen: () => false,
      isSecret: false,
      description: "Optional OpenAI API base URL override."
    },
    {
      name: "OPENAI_TIMEOUT_MS",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: String(DEFAULT_OPENAI_TIMEOUT_MS),
      description: "Timeout (ms) for OpenAI requests."
    },
    {
      name: "ESTIMATOR_PROMPT_VERSION",
      requiredWhen: () => false,
      isSecret: false,
      defaultValue: DEFAULT_PROMPT_VERSION,
      description: "Prompt version identifier for diagnostics."
    },
    {
      name: "ESTIMATOR_PROMPT",
      requiredWhen: () => false,
      isSecret: false,
      description: "Optional prompt override for estimation."
    }
  ];
}

export function buildEnvReport(cfg: DerivedConfig): EnvReport {
  const required: EnvStatus[] = [];
  const optional: EnvStatus[] = [];
  const missing_required: string[] = [];
  const snapshot: Record<string, EnvSnapshotEntry> = {};

  for (const spec of getEnvSpec()) {
    const rawValue = process.env[spec.name];
    const present = isPresent(rawValue);
    const requiredNow = spec.requiredWhen(cfg);
    const status: EnvStatus = {
      name: spec.name,
      present,
      required: requiredNow,
      defaultValue: spec.defaultValue,
      description: spec.description
    };

    if (requiredNow) {
      required.push(status);
      if (!present) {
        missing_required.push(spec.name);
      }
    } else {
      optional.push(status);
    }

    if (spec.isSecret) {
      snapshot[spec.name] = present
        ? {
            present: true,
            length: rawValue?.length ?? 0,
            sha256_8: rawValue ? sha256_8(rawValue) : "unknown"
          }
        : { present: false };
    } else {
      snapshot[spec.name] = present
        ? {
            present: true,
            value: rawValue ? truncateValue(rawValue) : ""
          }
        : { present: false };
    }
  }

  return {
    required,
    optional,
    missing_required,
    snapshot
  };
}
