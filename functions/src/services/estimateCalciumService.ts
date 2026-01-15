// Purpose: Orchestrate calcium estimation prompts, config selection, and logging.
// Persists: No persistence.
// Security Risks: Accesses OpenAI configuration and transmits image data to OpenAI.
import { EstimateError } from "./errors";
import { EstimateAnswers, EstimateResult, estimateFromImageAndAnswers } from "./openaiClient";

export type EstimateConfig = {
  useMock: boolean;
  apiKeyPresent: boolean;
  model: string;
  baseUrl?: string;
  apiKey?: string;
};

export type EstimateLogger = (event: string, payload: Record<string, unknown>) => void;

export const PROMPT_VERSION = "estimateCalcium_v2";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 20000;

export function getConfig(): EstimateConfig {
  const useMock = (process.env.USE_MOCK_ESTIMATE ?? "false").toLowerCase() === "true";
  const apiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0 ? process.env.OPENAI_API_KEY : undefined;
  const apiKeyPresent = Boolean(apiKey);
  const model = process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.trim().length > 0 ? process.env.OPENAI_MODEL : DEFAULT_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL && process.env.OPENAI_BASE_URL.trim().length > 0 ? process.env.OPENAI_BASE_URL : undefined;

  return {
    useMock,
    apiKeyPresent,
    model,
    baseUrl,
    apiKey
  };
}

export function buildEstimatePrompt(answers: EstimateAnswers, locale: string): string {
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
}): Promise<EstimateResult> {
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

    return mockResult;
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

  const prompt = buildEstimatePrompt(answers, locale);
  const startTime = Date.now();

  try {
    const result = await estimateFromImageAndAnswers({
      imageBase64,
      answers,
      locale,
      requestId,
      prompt,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: DEFAULT_TIMEOUT_MS
    });

    logger("estimate_openai_request_done", {
      request_id: requestId,
      latency_ms: Date.now() - startTime
    });

    logger("estimate_request_completed", {
      request_id: requestId,
      result: "openai_success",
      calcium_mg: result.calcium_mg,
      confidence_label: result.confidence_label
    });

    return result;
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
