import assert from "node:assert/strict";
import test from "node:test";

// Importing application configuration requires these fields, but the pure
// confidence checks below perform no database or provider calls.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.LLM_API_KEY ??= "test-key";

const { checkConfidence } = await import("../src/guardrails/confidence.js");

test("confidence passes exactly at the configured boundary", () => {
  assert.deepEqual(checkConfidence(0.7, 0.7), {
    passed: true,
    score: 0.7,
    threshold: 0.7,
  });
});

test("confidence fails below the configured boundary", () => {
  assert.deepEqual(checkConfidence(0.699, 0.7), {
    passed: false,
    score: 0.699,
    threshold: 0.7,
  });
});
