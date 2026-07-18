/**
 * U3 — Zod schemas for LLM structured outputs (single source of truth for shape).
 * U4 may re-use these; pipeline must not trust raw model text.
 */
import { z } from "zod";
import { Department, Priority } from "../types.js";

export const ClassificationSchema = z.object({
  category: z.nativeEnum(Department),
  priority: z.nativeEnum(Priority),
  requiredExpertise: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
  reasoning: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export const MatchDecisionSchema = z.enum(["ASSIGN", "UNASSIGNABLE"]);

export const MatchSchema = z
  .object({
    decision: MatchDecisionSchema,
    specialistId: z.string().min(1).nullable(),
    reasoning: z.string().min(1),
  })
  .superRefine((val, ctx) => {
    if (val.decision === "ASSIGN" && !val.specialistId) {
      ctx.addIssue({
        code: "custom",
        message: "specialistId is required when decision is ASSIGN",
        path: ["specialistId"],
      });
    }
    if (val.decision === "UNASSIGNABLE" && val.specialistId != null) {
      ctx.addIssue({
        code: "custom",
        message: "specialistId must be null when decision is UNASSIGNABLE",
        path: ["specialistId"],
      });
    }
  });

export type MatchResult = z.infer<typeof MatchSchema>;

export type CaseInfo = {
  category: Department;
  priority: Priority;
  requiredExpertise: string[];
  summary: string;
  scrubbedText?: string;
};

export type CandidateProfile = {
  id: string;
  name: string;
  title: string;
  department: Department;
  expertise: string[];
  profile: string;
};

export type LlmUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmMeta = {
  provider: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
  usage?: LlmUsage;
  /** True when matchSpecialist short-circuited with empty candidates (no HTTP). */
  skipped?: boolean;
};

export type LlmCallResult<T> = {
  result: T;
  llmMeta: LlmMeta;
};
