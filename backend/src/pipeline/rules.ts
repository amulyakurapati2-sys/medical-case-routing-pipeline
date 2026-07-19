/** Pure eligibility and final-veto rules; these never call the LLM or database. */
import { Department } from "../generated/prisma/index.js";
import type { CaseInfo } from "../llm/schemas.js";

/** Minimal structural shape shared by Specialist rows and candidate profiles. */
type CandidateLike = {
  id: string;
  department: string;
  expertise: string[];
};

/**
 * Deterministic base eligibility tags per department, merged with any classifier-provided
 * `requiredExpertise`. Used to narrow (softly) which same-department specialists fit best.
 */
const DEPARTMENT_BASE_EXPERTISE: Record<Department, string[]> = {
  [Department.CARDIOLOGY]: ["cardiology", "heart"],
  [Department.NEPHROLOGY]: ["nephrology", "kidney", "renal"],
  [Department.ONCOLOGY]: ["oncology", "cancer", "tumor"],
  [Department.NEUROLOGY]: ["neurology", "brain", "nervous"],
  [Department.ORTHOPEDICS]: ["orthopedics", "bone", "joint"],
  [Department.GENERAL]: ["general", "internal medicine"],
};

export function mapCategoryToExpertise(
  category: Department,
  requiredExpertise: string[],
): string[] {
  const base = DEPARTMENT_BASE_EXPERTISE[category] ?? [];
  const provided = requiredExpertise.map((t) => t.toLowerCase());
  return Array.from(new Set([...base, ...provided]));
}

/**
 * Keep same-department specialists; among those, prefer ones whose expertise overlaps the
 * required tags. If none overlap, fall back to all same-department candidates so the LLM can
 * still rank by free-text profile fit (the fuzzy-ranking seam).
 */
export function filterCandidates<T extends CandidateLike>(
  caseInfo: CaseInfo,
  specialists: T[],
): T[] {
  const category = String(caseInfo.category);
  const sameDept = specialists.filter((s) => s.department === category);
  if (sameDept.length === 0) {
    return [];
  }

  const required = mapCategoryToExpertise(caseInfo.category, caseInfo.requiredExpertise);
  if (required.length === 0) {
    return sameDept;
  }

  const withOverlap = sameDept.filter((s) =>
    s.expertise.some((e) => required.includes(e.toLowerCase())),
  );
  return withOverlap.length > 0 ? withOverlap : sameDept;
}

export type VetoResult = { pass: boolean; reason?: string };

/**
 * Final authority check on the LLM's chosen specialist: must be one of the candidates and in the
 * correct department. This is the last line before an assignment is trusted.
 */
export function veto<T extends CandidateLike>(
  caseInfo: CaseInfo,
  chosen: T,
  candidates: T[],
): VetoResult {
  if (!candidates.some((c) => c.id === chosen.id)) {
    return { pass: false, reason: "chosen specialist is not among the eligible candidates" };
  }
  if (chosen.department !== String(caseInfo.category)) {
    return { pass: false, reason: "chosen specialist department does not match case category" };
  }
  return { pass: true };
}
