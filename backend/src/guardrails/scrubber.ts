/**
 * U4 — PHI scrubber (SCR-*). Runs BEFORE any LLM call so the model never sees raw PHI.
 *
 * Heuristic and conservative: favors recall on obvious PHI for a synthetic-data demo.
 * This is NOT a compliance-grade de-identifier. Pure and deterministic (GRD-2).
 */

export type RedactionType =
  | "email"
  | "phone"
  | "mrn"
  | "nameLabel"
  | "address"
  | "dateOfBirth";

export type ScrubResult = {
  scrubbedText: string;
  redactions: Partial<Record<RedactionType, number>>;
  redactionCount: number;
};

type Rule = { type: RedactionType; pattern: RegExp };

// Order matters: more specific patterns (ssn, dob) run before generic digit runs (mrn).
const RULES: Rule[] = [
  {
    type: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    type: "dateOfBirth",
    // DOB-style labels, or bare dates like 01/02/1990 or 1990-01-02.
    pattern:
      /\b(?:dob|d\.o\.b\.|date of birth)\b\s*:?\s*[^\n,;]+|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/gi,
  },
  {
    type: "phone",
    // +1 (555) 123-4567, 555-123-4567, 5551234567 (10+ digits with separators).
    pattern:
      /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  },
  {
    type: "nameLabel",
    // "Name: John Doe", "Patient: Jane Q. Public".
    pattern:
      /\b(?:patient name|patient|name)\s*:?\s*[A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,3}/gi,
  },
  {
    type: "address",
    // "123 Main Street", "45 Oak Ave, Apt 2".
    pattern:
      /\b\d{1,6}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:street|st|avenue|ave|boulevard|blvd|road|rd|lane|ln|drive|dr|court|ct|way|place|pl)\b(?:\s*,?\s*(?:apt|apartment|suite|ste|unit)\s*\.?\s*\w+)?/gi,
  },
  {
    type: "mrn",
    // Long bare digit runs (7+) not already caught — MRN / record numbers.
    pattern: /\b\d{7,}\b/g,
  },
];

function placeholder(type: RedactionType): string {
  return `[REDACTED_${type.replace(/([A-Z])/g, "_$1").toUpperCase()}]`;
}

/**
 * Redact obvious PHI from free text.
 * Never throws on normal input; empty string → empty result with zero redactions.
 */
export function scrub(rawText: string): ScrubResult {
  const redactions: Partial<Record<RedactionType, number>> = {};
  let redactionCount = 0;

  if (!rawText) {
    return { scrubbedText: "", redactions, redactionCount };
  }

  let text = rawText;
  for (const { type, pattern } of RULES) {
    text = text.replace(pattern, () => {
      redactions[type] = (redactions[type] ?? 0) + 1;
      redactionCount += 1;
      return placeholder(type);
    });
  }

  return { scrubbedText: text, redactions, redactionCount };
}
