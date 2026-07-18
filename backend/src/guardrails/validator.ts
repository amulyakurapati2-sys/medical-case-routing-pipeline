/**
 * U4 — Output validator (VAL-*). Re-parses model output with the U3 schemas
 * (single source of truth) and returns a structured result with a retry signal.
 *
 * U4 does NOT retry — it only signals `retryable` so U5 can decide (GRD-3).
 */
import { z } from "zod";
import {
  ClassificationSchema,
  MatchSchema,
  type Classification,
  type MatchResult,
} from "../llm/schemas.js";

export type ValidationResult<T> = {
  ok: boolean;
  data?: T;
  retryable: boolean;
  issues: string[];
};

function toIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function validateWith<T>(schema: z.ZodType<T>, raw: unknown): ValidationResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data, retryable: false, issues: [] };
  }
  // Schema/shape mismatch is a retryable signal — the model may do better next attempt.
  return { ok: false, retryable: true, issues: toIssues(result.error) };
}

export function validateClassification(raw: unknown): ValidationResult<Classification> {
  return validateWith(ClassificationSchema, raw);
}

export function validateMatch(raw: unknown): ValidationResult<MatchResult> {
  return validateWith(MatchSchema, raw);
}
