import assert from "node:assert/strict";
import test from "node:test";
import { Department, Priority } from "../src/generated/prisma/index.js";
import {
  ClassificationSchema,
  MatchSchema,
} from "../src/llm/schemas.js";
import { extractJsonObject } from "../src/llm/json.js";

test("classification schema accepts a complete grounded response", () => {
  const parsed = ClassificationSchema.parse({
    category: Department.CARDIOLOGY,
    priority: Priority.HIGH,
    requiredExpertise: ["cardiology"],
    summary: "Synthetic cardiac case",
    reasoning: "Symptoms are consistent with a cardiac presentation.",
    confidence: 0.91,
  });

  assert.equal(parsed.category, Department.CARDIOLOGY);
  assert.equal(parsed.confidence, 0.91);
});

test("classification schema rejects unknown categories and invalid confidence", () => {
  const result = ClassificationSchema.safeParse({
    category: "DERMATOLOGY",
    priority: Priority.HIGH,
    requiredExpertise: [],
    summary: "Synthetic case",
    reasoning: "Invalid category for this application.",
    confidence: 1.2,
  });

  assert.equal(result.success, false);
});

test("match schema requires a specialist id for assignment", () => {
  const result = MatchSchema.safeParse({
    decision: "ASSIGN",
    specialistId: null,
    reasoning: "Candidate selected.",
  });

  assert.equal(result.success, false);
});

test("match schema requires a null specialist id when unassignable", () => {
  const result = MatchSchema.safeParse({
    decision: "UNASSIGNABLE",
    specialistId: "specialist-1",
    reasoning: "No candidate is available.",
  });

  assert.equal(result.success, false);
});

test("JSON extraction handles fenced model responses", () => {
  assert.deepEqual(extractJsonObject('```json\n{"decision":"ASSIGN"}\n```'), {
    decision: "ASSIGN",
  });
});

test("JSON extraction rejects empty model responses", () => {
  assert.throws(() => extractJsonObject("   "), /Empty model content/);
});
