import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.LLM_API_KEY ??= "test-key";

const { classifyProviderFailure } = await import("../src/llm/client.js");
const { LlmError } = await import("../src/llm/errors.js");
const { safeFailure } = await import("../src/pipeline/orchestrator.js");

test("transient and configuration provider failures are separated", () => {
  assert.deepEqual(classifyProviderFailure({ status: 429 }), {
    code: "PROVIDER_UNAVAILABLE",
    retryable: true,
  });
  assert.deepEqual(classifyProviderFailure({ status: 503 }), {
    code: "PROVIDER_UNAVAILABLE",
    retryable: true,
  });
  assert.deepEqual(classifyProviderFailure({ status: 401 }), {
    code: "CONFIGURATION_ERROR",
    retryable: false,
  });
});

test("safe failure events retain useful diagnostics without the underlying error", () => {
  const sensitiveCause = new Error("raw provider response and secret token");
  const error = new LlmError("Specialist match failed after 3 attempts", {
    code: "INVALID_MODEL_RESPONSE",
    cause: sensitiveCause,
    lastMeta: {
      provider: "provider.example",
      model: "test-model",
      latencyMs: 25,
      promptVersion: "match-v2",
    },
    diagnostics: {
      stage: "MATCH_SPECIALIST",
      code: "INVALID_MODEL_RESPONSE",
      attempts: 3,
    },
  });

  const failure = safeFailure(error, "MATCH_SPECIALIST");
  assert.deepEqual(failure.data, {
    stage: "MATCH_SPECIALIST",
    code: "INVALID_MODEL_RESPONSE",
    attempts: 3,
  });
  assert.equal(failure.llmMeta?.provider, "provider.example");
  assert.doesNotMatch(JSON.stringify(failure), /secret token|raw provider response/);
});

test("unexpected errors use one safe internal category", () => {
  const failure = safeFailure(
    new Error("database connection string and internal stack"),
    "PIPELINE",
  );

  assert.deepEqual(failure, {
    reason: "Internal pipeline error",
    data: {
      stage: "PIPELINE",
      code: "INTERNAL_ERROR",
      attempts: 1,
    },
  });
});
