/**
 * U3 — Typed LLM failure after retries exhausted (RET-3). No secrets in message.
 */
import type { LlmMeta } from "./schemas.js";

export class LlmError extends Error {
  readonly code: string;
  readonly lastMeta?: LlmMeta;

  constructor(message: string, options?: { code?: string; cause?: unknown; lastMeta?: LlmMeta }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "LlmError";
    this.code = options?.code ?? "LLM_FAILED";
    this.lastMeta = options?.lastMeta;
  }
}
