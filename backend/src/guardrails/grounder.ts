/**
 * U4 — Grounder (GRN-*). Verifies the model's choices against reality:
 *   - classification category is a real Department
 *   - a chosen specialist id actually exists among the supplied candidates
 *
 * Grounding failure is a retryable signal to U5 (the model hallucinated). Pure (GRD-2).
 */
import { Department } from "../types.js";
import type { MatchResult } from "../llm/schemas.js";

export type GroundingResult = {
  grounded: boolean;
  violations: string[];
};

const DEPARTMENTS = new Set<string>(Object.values(Department));

export function groundClassification(category: string): GroundingResult {
  if (DEPARTMENTS.has(category)) {
    return { grounded: true, violations: [] };
  }
  return {
    grounded: false,
    violations: [`category '${category}' is not a known Department`],
  };
}

export function groundMatch(
  match: MatchResult,
  candidateIds: readonly string[],
): GroundingResult {
  const violations: string[] = [];

  if (match.decision === "ASSIGN") {
    if (!match.specialistId) {
      violations.push("decision is ASSIGN but specialistId is missing");
    } else if (!candidateIds.includes(match.specialistId)) {
      violations.push(
        `specialistId '${match.specialistId}' is not among the supplied candidates`,
      );
    }
  } else if (match.decision === "UNASSIGNABLE" && match.specialistId != null) {
    violations.push("decision is UNASSIGNABLE but specialistId is not null");
  }

  return { grounded: violations.length === 0, violations };
}
