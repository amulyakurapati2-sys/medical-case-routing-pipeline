/**
 * U3 — Provider-agnostic OpenAI-compatible LlmClient.
 *
 * Configured from AppConfig (baseURL / apiKey / model / jsonMode / timeout / retries).
 * Returns only zod-parsed results + llmMeta. Does not scrub, persist, or ground.
 */
import OpenAI from "openai";
import type { AppConfig } from "../config/env.js";
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  CLASSIFY_PROMPT_VERSION,
} from "./classifyCase.js";
import { LlmError } from "./errors.js";
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

function providerLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || "openai-compatible";
  } catch {
    return "openai-compatible";
  }
}

export function createLlmClient(config: AppConfig): LlmClient {
  const openai = new OpenAI({
    apiKey: config.LLM_API_KEY,
    baseURL: config.LLM_BASE_URL,
    timeout: config.LLM_TIMEOUT_MS,
    maxRetries: 0, // we own the retry loop (RET-2)
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
  }): Promise<LlmCallResult<T>> {
    let lastMeta: LlmMeta | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
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
        lastMeta = {
          provider,
          model,
          latencyMs: Date.now() - started,
          promptVersion: params.promptVersion,
        };
      }
    }

    throw new LlmError(
      `${params.failureLabel} failed after ${maxAttempts} attempt(s)`,
      { code: "LLM_RETRIES_EXHAUSTED", cause: lastError, lastMeta },
    );
  }

  return {
    async classifyCase(scrubbedText: string): Promise<LlmCallResult<Classification>> {
      if (!scrubbedText.trim()) {
        throw new LlmError("scrubbedText must not be empty", {
          code: "LLM_INVALID_INPUT",
        });
      }

      return completeAndParse({
        system: buildClassifySystemPrompt(),
        user: buildClassifyUserPrompt(scrubbedText),
        promptVersion: CLASSIFY_PROMPT_VERSION,
        parse: (raw) => ClassificationSchema.parse(raw),
        failureLabel: "Classification",
      });
    },

    async matchSpecialist(
      caseInfo: CaseInfo,
      candidates: CandidateProfile[],
    ): Promise<LlmCallResult<MatchResult>> {
      // MATCH-1: empty list → no HTTP
      if (candidates.length === 0) {
        return {
          result: {
            decision: "UNASSIGNABLE",
            specialistId: null,
            reasoning: "No eligible candidates supplied",
          },
          llmMeta: {
            provider,
            model,
            latencyMs: 0,
            promptVersion: MATCH_PROMPT_VERSION,
            skipped: true,
          },
        };
      }

      return completeAndParse({
        system: buildMatchSystemPrompt(),
        user: buildMatchUserPrompt(caseInfo, candidates),
        promptVersion: MATCH_PROMPT_VERSION,
        parse: (raw) => {
          const parsed = MatchSchema.parse(raw);
          if (parsed.decision === "UNASSIGNABLE") {
            throw new Error(
              "Model returned UNASSIGNABLE despite receiving eligible candidates",
            );
          }
          return parsed;
        },
        failureLabel: "Specialist match",
      });
    },
  };
}
