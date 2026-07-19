import assert from "node:assert/strict";
import test from "node:test";
import {
  IdempotencyConflictError,
  assertPtoCommandMatches,
} from "../src/db/repositories/specialistRepository.js";

const recordedCommand = {
  kind: "PTO",
  resourceType: "specialist",
  resourceId: "specialist-1",
  resultSummary: { onPto: true },
};

test("an identical PTO command is accepted as a replay", () => {
  assert.doesNotThrow(() =>
    assertPtoCommandMatches(recordedCommand, {
      specialistId: "specialist-1",
      onPto: true,
    }),
  );
});

test("a command ID cannot be reused for another specialist", () => {
  assert.throws(
    () =>
      assertPtoCommandMatches(recordedCommand, {
        specialistId: "specialist-2",
        onPto: true,
      }),
    IdempotencyConflictError,
  );
});

test("a command ID cannot be reused with the opposite PTO value", () => {
  assert.throws(
    () =>
      assertPtoCommandMatches(recordedCommand, {
        specialistId: "specialist-1",
        onPto: false,
      }),
    IdempotencyConflictError,
  );
});

test("legacy PTO commands without a payload remain replayable", () => {
  assert.doesNotThrow(() =>
    assertPtoCommandMatches(
      { ...recordedCommand, resultSummary: null },
      { specialistId: "specialist-1", onPto: true },
    ),
  );
});
