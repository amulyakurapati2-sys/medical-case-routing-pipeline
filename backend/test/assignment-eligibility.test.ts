import assert from "node:assert/strict";
import test from "node:test";
import { Department } from "../src/generated/prisma/index.js";
import { assignmentRejectionReason } from "../src/db/repositories/assignmentEligibility.js";

const specialist = {
  department: Department.CARDIOLOGY,
  onPto: false,
  maxCapacity: 3,
};

test("assignment remains eligible below specialist capacity", () => {
  assert.equal(
    assignmentRejectionReason(specialist, Department.CARDIOLOGY, 2),
    null,
  );
});

test("assignment is rejected when capacity has been reached", () => {
  assert.equal(
    assignmentRejectionReason(specialist, Department.CARDIOLOGY, 3),
    "Selected specialist reached capacity (3/3)",
  );
});

test("assignment is rejected when the specialist went on PTO", () => {
  assert.equal(
    assignmentRejectionReason(
      { ...specialist, onPto: true },
      Department.CARDIOLOGY,
      0,
    ),
    "Selected specialist is now on PTO",
  );
});

test("assignment is rejected when the department no longer matches", () => {
  assert.equal(
    assignmentRejectionReason(specialist, Department.NEPHROLOGY, 0),
    "Selected specialist no longer matches the case department",
  );
});
