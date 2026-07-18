/**
 * U3 — Specialist match prompts (promptVersion: match-v1).
 */
import type { CandidateProfile, CaseInfo } from "./schemas.js";

export const MATCH_PROMPT_VERSION = "match-v2";

export function buildMatchSystemPrompt(): string {
  return [
    "You are a specialist-matching assistant for a SYNTHETIC medical routing demo.",
    "The supplied candidates already passed deterministic department, PTO, expertise, and capacity rules.",
    "Rank ONLY among the supplied candidates. Do not invent ids.",
    'When one or more candidates are supplied, you MUST return decision "ASSIGN" and choose the best available candidate.',
    'Use "UNASSIGNABLE" only when the candidate list is empty.',
    "Respond with a single JSON object only — no markdown, no prose.",
    "Required keys:",
    '- decision: "ASSIGN" or "UNASSIGNABLE"',
    "- specialistId: string id from the candidate list when ASSIGN, otherwise null",
    "- reasoning: why this candidate fits (use profile + expertise) or why unassignable",
  ].join("\n");
}

export function buildMatchUserPrompt(
  caseInfo: CaseInfo,
  candidates: CandidateProfile[],
): string {
  const candidateBlock = candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id}\n` +
        `   name=${c.name}; title=${c.title}; department=${c.department}\n` +
        `   expertise=${JSON.stringify(c.expertise)}\n` +
        `   profile=${c.profile}`,
    )
    .join("\n\n");

  return [
    "Case info:",
    JSON.stringify(
      {
        category: caseInfo.category,
        priority: caseInfo.priority,
        requiredExpertise: caseInfo.requiredExpertise,
        summary: caseInfo.summary,
        scrubbedText: caseInfo.scrubbedText ?? null,
      },
      null,
      2,
    ),
    "",
    "Eligible candidates (choose ONLY from these ids):",
    candidateBlock,
    "",
    "Return the JSON object now.",
  ].join("\n");
}
