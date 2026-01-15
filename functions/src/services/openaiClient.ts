// Purpose: Call the OpenAI API to estimate calcium using image and answer metadata.
// Persists: No persistence.
// Security Risks: Handles OpenAI API keys and transmits user-provided images.
import OpenAI from "openai";

import { EstimateError } from "./errors";

export type EstimateAnswers = {
  portion_size: "small" | "medium" | "large";
  contains_dairy: "yes" | "no" | "not_sure";
  contains_tofu_or_small_fish_bones: "yes" | "no" | "not_sure";
};

export type EstimateResult = {
  calcium_mg: number;
  confidence: number;
  confidence_label: "low" | "medium" | "high";
  explanation_short: string;
  warnings: string[];
};

const RESPONSE_SCHEMA = {
  name: "calcium_estimate",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      calcium_mg: { type: "integer" },
      confidence: { type: "number" },
      confidence_label: { type: "string", enum: ["low", "medium", "high"] },
      explanation_short: { type: "string" },
      warnings: { type: "array", items: { type: "string" } }
    },
    required: ["calcium_mg", "confidence", "confidence_label", "explanation_short", "warnings"]
  },
  strict: true
} as const;

function getOutputText(response: OpenAI.Responses.Response): string | null {
  if (response.output_text) {
    return response.output_text;
  }

  const output = response.output ?? [];
  for (const item of output) {
    if (!("content" in item)) {
      continue;
    }

    const contentItems =
      (item as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
    for (const content of contentItems) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function parseEstimatePayload(payload: string): EstimateResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new EstimateError("model_invalid_response", "Model returned invalid JSON.", error);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new EstimateError("model_invalid_response", "Model returned empty JSON.");
  }

  const result = parsed as EstimateResult;
  if (typeof result.calcium_mg !== "number") {
    throw new EstimateError("model_invalid_response", "Model response missing calcium estimate.");
  }

  return result;
}

export async function estimateFromImageAndAnswers({
  imageBase64,
  answers,
  locale,
  requestId,
  prompt,
  model,
  apiKey,
  baseUrl,
  timeoutMs
}: {
  imageBase64: string;
  answers: EstimateAnswers;
  locale: string;
  requestId: string;
  prompt: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs: number;
}): Promise<EstimateResult> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const responseParams = {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_text", text: `Locale: ${locale}. Request ID: ${requestId}.` },
            { type: "input_text", text: `Answers: portion=${answers.portion_size}, dairy=${answers.contains_dairy}, tofu_or_small_fish_bones=${answers.contains_tofu_or_small_fish_bones}.` },
            { type: "input_image", image_url: `data:image/jpeg;base64,${imageBase64}`, detail: "auto" }
          ]
        }
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
      stream: false
    } as OpenAI.Responses.ResponseCreateParams;

    const response = await client.responses.create(responseParams, { signal: controller.signal });
    if (!("output" in response)) {
      throw new EstimateError("model_invalid_response", "Model returned a streamed response.");
    }

    const outputText = getOutputText(response);
    if (!outputText) {
      throw new EstimateError("model_invalid_response", "Model returned empty response.");
    }

    return parseEstimatePayload(outputText);
  } catch (error) {
    if (error instanceof EstimateError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new EstimateError("upstream_timeout", "OpenAI request timed out.", error);
    }

    throw new EstimateError("upstream_unavailable", "OpenAI request failed.", error);
  } finally {
    clearTimeout(timeout);
  }
}
