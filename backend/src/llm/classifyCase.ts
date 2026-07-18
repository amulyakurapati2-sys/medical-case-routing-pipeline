/**
 * U3 — Classification prompts (promptVersion: classify-v1).
 */
import { Department, Priority } from "../types.js";

export const CLASSIFY_PROMPT_VERSION = "classify-v1";

const DEPARTMENTS = Object.values(Department).join(", ");
const PRIORITIES = Object.values(Priority).join(", ");

export function buildClassifySystemPrompt(): string {
  return [
    "You are a medical case triage assistant for a SYNTHETIC demo (not real care).",
    "Classify the scrubbed case text into a structured JSON decision.",
    "Respond with a single JSON object only — no markdown, no prose.",
    "Required keys:",
    '- category: one of [' + DEPARTMENTS + "]",
    '- priority: one of [' + PRIORITIES + "]",
    "- requiredExpertise: string[] (structured tags for eligibility matching)",
    "- summary: short plain-language summary",
    "- reasoning: why you chose this category/priority",
    "- confidence: number from 0 to 1",
  ].join("\n");
}

export function buildClassifyUserPrompt(scrubbedText: string): string {
  return `Scrubbed case text:\n"""\n${scrubbedText}\n"""\n\nReturn the JSON object now.`;
}
