// Purpose: Define error types and helpers for estimate calcium operations.
// Persists: No persistence.
// Security Risks: Handles error messages originating from upstream API calls.

export type EstimateErrorCode = "upstream_unavailable" | "model_invalid_response" | "upstream_timeout";

export class EstimateError extends Error {
  public readonly code: EstimateErrorCode;
  public readonly cause?: unknown;

  constructor(code: EstimateErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "EstimateError";
    this.code = code;
    this.cause = cause;
  }
}

export function isEstimateError(error: unknown): error is EstimateError {
  return error instanceof EstimateError;
}
