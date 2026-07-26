/** Provider-agnostic OpenAI-compatible client returning validated results. */
import OpenAI from "openai";
import type { AppConfig } from "../config/env.js";
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  CLASSIFY_PROMPT_VERSION,
} from "./classifyCase.js";
import {
  LlmError,
  type LlmFailureCode,
  type LlmFailureStage,
} from "./errors.js";
import { extractJsonObject } from "./json.js";
import {
  buildMatchSystemPrompt,
  buildMatchUserPrompt,
  MATCH_PROMPT_VERSION,
} from "./matchSpecialist.js";
import {
  ClassificationSchema,
  MatchSchema,
  type CandidateProfile,
  type CaseInfo,
  type Classification,
  type LlmCallResult,
  type LlmMeta,
  type MatchResult,
} from "./schemas.js";

export interface LlmClient {
  classifyCase(scrubbedText: string): Promise<LlmCallResult<Classification>>;
  matchSpecialist(
    caseInfo: CaseInfo,
    candidates: CandidateProfile[],
  ): Promise<LlmCallResult<MatchResult>>;
}

export function parseMatchResponse(
  raw: unknown,
  candidateIds: readonly string[],
): MatchResult {
  const parsed = MatchSchema.parse(raw);
  if (!candidateIds.includes(parsed.specialistId)) {
    throw new Error(
      `Model selected specialistId '${parsed.specialistId}' outside the supplied candidates`,
    );
  }
  return parsed;
}

function providerLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || "openai-compatible";
  } catch {
    return "openai-compatible";
  }
}

function numericProperty(error: unknown, property: string): number | undefined {
  if (typeof error !== "object" || error === null || !(property in error)) {
    return undefined;
  }
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "number" ? value : undefined;
}

/** Separate transient provider failures from configuration/client errors. */
export function classifyProviderFailure(error: unknown): {
  code: LlmFailureCode;
  retryable: boolean;
} {
  const status = numericProperty(error, "status");
  if (status !== undefined && status >= 400 && status < 500) {
    if (status !== 408 && status !== 429) {
      return { code: "CONFIGURATION_ERROR", retryable: false };
    }
  }
  return { code: "PROVIDER_UNAVAILABLE", retryable: true };
}

export function createLlmClient(config: AppConfig): LlmClient {
  const openai = new OpenAI({
    apiKey: config.LLM_API_KEY,
    baseURL: config.LLM_BASE_URL,
    timeout: config.LLM_TIMEOUT_MS,
    maxRetries: 0, // The bounded retry loop below owns retry behavior.
  });

  const provider = providerLabel(config.LLM_BASE_URL);
  const model = config.LLM_MODEL;
  const maxAttempts = 1 + config.LLM_MAX_RETRIES;

  async function completeAndParse<T>(params: {
    system: string;
    user: string;
    promptVersion: string;
    parse: (raw: unknown) => T;
    failureLabel: string;
    stage: LlmFailureStage;
  }): Promise<LlmCallResult<T>> {
    let lastMeta: LlmMeta | undefined;
    let lastError: unknown;
    let failureCode: LlmFailureCode = "PROVIDER_UNAVAILABLE";
    let retryable = true;
    let attempts = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      const started = Date.now();
      let receivedResponse = false;
      try {
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user },
          ],
          temperature: 0.2,
          ...(config.LLM_JSON_MODE
            ? { response_format: { type: "json_object" as const } }
            : {}),
        });
        receivedResponse = true;
        const content = completion.choices[0]?.message?.content ?? "";
        const usage = completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined;

        lastMeta = {
          provider,
          model,
          latencyMs: Date.now() - started,
          promptVersion: params.promptVersion,
          usage,
        };
        const raw = extractJsonObject(content);
        const result = params.parse(raw);
        return { result, llmMeta: lastMeta };
      } catch (err) {
        lastError = err;
        const failure = receivedResponse
          ? { code: "INVALID_MODEL_RESPONSE" as const, retryable: true }
          : classifyProviderFailure(err);
        failureCode = failure.code;
        retryable = failure.retryable;
        if (!receivedResponse) {
          lastMeta = {
            provider,
            model,
            latencyMs: Date.now() - started,
            promptVersion: params.promptVersion,
          };
        }
        if (!retryable) {
          break;
        }
      }
    }

    throw new LlmError(
      `${params.failureLabel} failed after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
      {
        code: failureCode,
        cause: lastError,
        lastMeta,
        diagnostics: {
          stage: params.stage,
          code: failureCode,
          attempts,
        },
      },
    );
  }

  return {
    async classifyCase(scrubbedText: string): Promise<LlmCallResult<Classification>> {
      if (!scrubbedText.trim()) {
        throw new LlmError("scrubbedText must not be empty", {
          code: "INTERNAL_ERROR",
          diagnostics: {
            stage: "CLASSIFICATION",
            code: "INTERNAL_ERROR",
            attempts: 0,
          },
        });
      }

      return completeAndParse({
        system: buildClassifySystemPrompt(),
        user: buildClassifyUserPrompt(scrubbedText),
        promptVersion: CLASSIFY_PROMPT_VERSION,
        parse: (raw) => ClassificationSchema.parse(raw),
        failureLabel: "Classification",
        stage: "CLASSIFICATION",
      });
    },

    async matchSpecialist(
      caseInfo: CaseInfo,
      candidates: CandidateProfile[],
    ): Promise<LlmCallResult<MatchResult>> {
      if (candidates.length < 2) {
        throw new LlmError(
          "matchSpecialist requires at least two eligible candidates",
          {
            code: "INTERNAL_ERROR",
            diagnostics: {
              stage: "MATCH_SPECIALIST",
              code: "INTERNAL_ERROR",
              attempts: 0,
            },
          },
        );
      }

      const candidateIds = candidates.map((candidate) => candidate.id);
      return completeAndParse({
        system: buildMatchSystemPrompt(),
        user: buildMatchUserPrompt(caseInfo, candidates),
        promptVersion: MATCH_PROMPT_VERSION,
        parse: (raw) => parseMatchResponse(raw, candidateIds),
        failureLabel: "Specialist match",
        stage: "MATCH_SPECIALIST",
      });
    },
  };
}
