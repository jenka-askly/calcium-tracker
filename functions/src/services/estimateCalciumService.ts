// Purpose: Orchestrate calcium estimation prompts, config selection, and logging.
// Persists: No persistence.
// Security Risks: Accesses OpenAI configuration and transmits image data to OpenAI.
import { EstimateError } from "./errors";
import { EstimateAnswers, EstimateOpenAIResult, EstimateResult, estimateFromImageAndAnswers } from "./openaiClient";

export type EstimateConfig = {
  useMock: boolean;
  apiKeyPresent: boolean;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  promptVersion: string;
  promptOverride?: string;
};

export type EstimateOutcome = {
  result: EstimateResult;
  rawText: string | null;
  latencyMs: number;
  mode: "mock" | "openai";
};

export type EstimateLogger = (event: string, payload: Record<string, unknown>) => void;

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_PROMPT_VERSION = "estimateCalcium_v1";

function parseTimeoutMs(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_TIMEOUT_MS;
}

function getPromptVersion(): string {
  return process.env.ESTIMATOR_PROMPT_VERSION?.trim() || DEFAULT_PROMPT_VERSION;
}

export const PROMPT_VERSION = getPromptVersion();

export function getConfig(): EstimateConfig {
  const useMock = (process.env.ESTIMATE_MODE ?? "").toLowerCase() === "mock";
  const apiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0 ? process.env.OPENAI_API_KEY : undefined;
  const apiKeyPresent = Boolean(apiKey);
  const model = process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.trim().length > 0 ? process.env.OPENAI_MODEL : DEFAULT_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL && process.env.OPENAI_BASE_URL.trim().length > 0 ? process.env.OPENAI_BASE_URL : undefined;
  const timeoutMs = parseTimeoutMs(process.env.OPENAI_TIMEOUT_MS);
  const promptOverride = process.env.ESTIMATOR_PROMPT?.trim() || undefined;
  const promptVersion = getPromptVersion();

  return {
    useMock,
    apiKeyPresent,
    model,
    baseUrl,
    apiKey,
    timeoutMs,
    promptVersion,
    promptOverride
  };
}

export function buildEstimatePrompt(answers: EstimateAnswers, locale: string, promptOverride?: string): string {
  if (promptOverride) {
    return promptOverride;
  }

  return [
    "You are a nutrition estimator.",
    "Estimate calcium mg for the meal in the photo.",
    "Output JSON only. No markdown.",
    "calcium_mg must be an integer (mg).",
    "confidence must be between 0 and 1.",
    "confidence_label must be one of: low, medium, high.",
    "If uncertain, still estimate but lower confidence.",
    `Write explanation_short and warnings in locale: ${locale}.`,
    "Use these answers:",
    `- Portion size: ${answers.portion_size}`,
    `- Contains dairy: ${answers.contains_dairy}`,
    `- Contains tofu or small fish bones: ${answers.contains_tofu_or_small_fish_bones}`
  ].join("\n");
}

export async function estimateCalcium({
  imageBase64,
  answers,
  locale,
  requestId,
  logger,
  config
}: {
  imageBase64: string;
  answers: EstimateAnswers;
  locale: string;
  requestId: string;
  logger: EstimateLogger;
  config: EstimateConfig;
}): Promise<EstimateOutcome> {
  if (config.useMock) {
    const mockResult: EstimateResult = {
      calcium_mg: 300,
      confidence: 0.6,
      confidence_label: "medium",
      explanation_short: "Mock estimate for development.",
      warnings: []
    };

    logger("estimate_request_completed", {
      request_id: requestId,
      result: "mock_success",
      calcium_mg: mockResult.calcium_mg,
      confidence_label: mockResult.confidence_label
    });

    return {
      result: mockResult,
      rawText: null,
      latencyMs: 0,
      mode: "mock"
    };
  }

  if (!config.apiKey) {
    throw new EstimateError("upstream_unavailable", "OpenAI API key missing.");
  }

  const imageBytesApprox = Math.round((imageBase64.length * 3) / 4);
  logger("estimate_openai_request_start", {
    request_id: requestId,
    image_bytes_approx: imageBytesApprox,
    answers
  });

  const startTime = Date.now();

  try {
    const openaiResult: EstimateOpenAIResult = await estimateFromImageAndAnswers({
      imageBase64,
      answers,
      locale,
      requestId,
      prompt: buildEstimatePrompt(answers, locale, config.promptOverride),
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs
    });

    const latencyMs = Date.now() - startTime;
    logger("estimate_openai_request_done", {
      request_id: requestId,
      latency_ms: latencyMs
    });

    logger("estimate_request_completed", {
      request_id: requestId,
      result: "openai_success",
      calcium_mg: openaiResult.result.calcium_mg,
      confidence_label: openaiResult.result.confidence_label
    });

    return {
      result: openaiResult.result,
      rawText: openaiResult.rawText,
      latencyMs,
      mode: "openai"
    };
  } catch (error) {
    logger("estimate_openai_request_done", {
      request_id: requestId,
      latency_ms: Date.now() - startTime
    });

    if (error instanceof EstimateError && error.code === "model_invalid_response") {
      logger("estimate_openai_parse_error", {
        request_id: requestId,
        message: error.message
      });
    }

    throw error;
  }
}
