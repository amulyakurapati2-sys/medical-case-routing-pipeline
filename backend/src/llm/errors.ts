import type { LlmMeta } from "./schemas.js";

export type LlmFailureStage = "CLASSIFICATION" | "MATCH_SPECIALIST";

export type LlmFailureCode =
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_MODEL_RESPONSE"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

export type LlmFailureDiagnostics = {
  stage: LlmFailureStage;
  code: LlmFailureCode;
  attempts: number;
};

/** Safe, typed LLM failure surfaced after retries are exhausted. */
export class LlmError extends Error {
  readonly code: string;
  readonly lastMeta?: LlmMeta;
  readonly diagnostics?: LlmFailureDiagnostics;

  constructor(
    message: string,
    options?: {
      code?: string;
      cause?: unknown;
      lastMeta?: LlmMeta;
      diagnostics?: LlmFailureDiagnostics;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "LlmError";
    this.code = options?.code ?? "LLM_FAILED";
    this.lastMeta = options?.lastMeta;
    this.diagnostics = options?.diagnostics;
  }
}
