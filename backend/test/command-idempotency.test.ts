import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCommandMatches,
  IdempotencyConflictError,
} from "../src/db/repositories/idempotency.js";

const command = {
  kind: "REVIEW",
  resourceType: "case",
  resourceId: "case-1",
  resultSummary: {
    approve: false,
    overrideCategory: "CARDIOLOGY",
    overridePriority: null,
  },
};

test("an identical case command is accepted as a replay", () => {
  assert.doesNotThrow(() => assertCommandMatches(command, command));
});

test("a command ID cannot be reused for another case", () => {
  assert.throws(
    () => assertCommandMatches(command, { ...command, resourceId: "case-2" }),
    IdempotencyConflictError,
  );
});

test("a command ID cannot be reused with a different review decision", () => {
  assert.throws(
    () =>
      assertCommandMatches(command, {
        ...command,
        resultSummary: { ...command.resultSummary, approve: true },
      }),
    IdempotencyConflictError,
  );
});
