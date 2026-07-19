import assert from "node:assert/strict";
import test from "node:test";
import { scrub } from "../src/guardrails/scrubber.js";

test("scrub redacts common identifiers before they reach the model", () => {
  const input = [
    "Patient: Jane Example",
    "DOB: 01/02/1990",
    "email jane@example.com",
    "phone 312-555-0198",
    "MRN 123456789",
  ].join(", ");

  const result = scrub(input);

  assert.equal(result.redactionCount, 5);
  assert.equal(result.scrubbedText.includes("Jane Example"), false);
  assert.equal(result.scrubbedText.includes("jane@example.com"), false);
  assert.equal(result.scrubbedText.includes("312-555-0198"), false);
  assert.equal(result.scrubbedText.includes("123456789"), false);
  assert.deepEqual(result.redactions, {
    email: 1,
    dateOfBirth: 1,
    phone: 1,
    nameLabel: 1,
    mrn: 1,
  });
});

test("scrub leaves ordinary synthetic clinical text intact", () => {
  const input = "Synthetic adult with chest pain and elevated troponin.";

  assert.deepEqual(scrub(input), {
    scrubbedText: input,
    redactions: {},
    redactionCount: 0,
  });
});

test("scrub handles empty input deterministically", () => {
  assert.deepEqual(scrub(""), {
    scrubbedText: "",
    redactions: {},
    redactionCount: 0,
  });
});
