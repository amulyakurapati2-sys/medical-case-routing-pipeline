import assert from "node:assert/strict";
import test from "node:test";
import { Department, Priority } from "../src/generated/prisma/index.js";
import { groundMatch } from "../src/guardrails/grounder.js";
import type { CaseInfo } from "../src/llm/schemas.js";
import { filterCandidates, veto } from "../src/pipeline/rules.js";

const caseInfo: CaseInfo = {
  category: Department.NEPHROLOGY,
  priority: Priority.MEDIUM,
  requiredExpertise: ["renal biopsy"],
  summary: "Synthetic renal case",
};

const candidates = [
  {
    id: "renal-biopsy-specialist",
    department: Department.NEPHROLOGY,
    expertise: ["renal biopsy"],
  },
  {
    id: "general-nephrologist",
    department: Department.NEPHROLOGY,
    expertise: ["nephrology"],
  },
  {
    id: "cardiologist",
    department: Department.CARDIOLOGY,
    expertise: ["cardiology"],
  },
];

test("candidate filtering keeps the matching department and expertise", () => {
  const result = filterCandidates(caseInfo, candidates);

  assert.deepEqual(result.map((candidate) => candidate.id), [
    "renal-biopsy-specialist",
    "general-nephrologist",
  ]);
});

test("candidate filtering falls back to same-department candidates", () => {
  const candidatesWithoutOverlap = [
    {
      id: "nephrologist-a",
      department: Department.NEPHROLOGY,
      expertise: ["glomerular disease"],
    },
    {
      id: "nephrologist-b",
      department: Department.NEPHROLOGY,
      expertise: ["dialysis access"],
    },
    candidates[2]!,
  ];
  const result = filterCandidates(
    { ...caseInfo, requiredExpertise: ["unrepresented subspecialty"] },
    candidatesWithoutOverlap,
  );

  assert.deepEqual(result.map((candidate) => candidate.id), [
    "nephrologist-a",
    "nephrologist-b",
  ]);
});

test("grounding rejects a model-selected id outside the supplied list", () => {
  const result = groundMatch(
    {
      decision: "ASSIGN",
      specialistId: "invented-specialist",
      reasoning: "Invented selection.",
    },
    candidates.map((candidate) => candidate.id),
  );

  assert.equal(result.grounded, false);
  assert.match(result.violations[0] ?? "", /not among the supplied candidates/);
});

test("final veto accepts an eligible supplied candidate", () => {
  const eligible = candidates.slice(0, 2);

  assert.deepEqual(veto(caseInfo, eligible[0]!, eligible), { pass: true });
});

test("final veto rejects a candidate from the wrong department", () => {
  const result = veto(caseInfo, candidates[2]!, candidates);

  assert.equal(result.pass, false);
  assert.match(result.reason ?? "", /department does not match/);
});
