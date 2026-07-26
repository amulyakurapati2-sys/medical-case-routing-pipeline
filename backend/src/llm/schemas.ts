/** Runtime schemas and types for validated LLM responses. */
import { z } from "zod";
import { Department, Priority } from "../generated/prisma/index.js";

export const ClassificationSchema = z.object({
  category: z.nativeEnum(Department),
  priority: z.nativeEnum(Priority),
  requiredExpertise: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
  reasoning: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export const MatchSchema = z.object({
  decision: z.literal("ASSIGN"),
  specialistId: z.string().min(1),
  reasoning: z.string().min(1),
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
};

export type LlmCallResult<T> = {
  result: T;
  llmMeta: LlmMeta;
};
