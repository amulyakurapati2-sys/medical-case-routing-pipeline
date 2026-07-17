/**
 * Shared domain enums used across the API, database, and UI.
 * String enums keep stored values and JSON payloads human-readable.
 */

/** Current status of a medical case as it moves through the routing pipeline. */
export enum CaseStatus {
  RECEIVED = "RECEIVED",
  SCRUBBED = "SCRUBBED",
  CLASSIFIED = "CLASSIFIED",
  NEEDS_REVIEW = "NEEDS_REVIEW",
  ASSIGNED = "ASSIGNED",
  REASSIGNED = "REASSIGNED",
  UNASSIGNABLE = "UNASSIGNABLE",
  FAILED = "FAILED",
}

/** Type of an entry in a case's append-only event timeline. */
export enum CaseEventType {
  RECEIVED = "RECEIVED",
  SCRUBBED = "SCRUBBED",
  CLASSIFIED = "CLASSIFIED",
  NEEDS_REVIEW = "NEEDS_REVIEW",
  ASSIGNED = "ASSIGNED",
  REASSIGNED = "REASSIGNED",
  UNASSIGNABLE = "UNASSIGNABLE",
  FAILED = "FAILED",
}

/**
 * Specialist department / case category.
 * Classification must choose a value from this fixed set.
 */
export enum Department {
  CARDIOLOGY = "CARDIOLOGY",
  NEPHROLOGY = "NEPHROLOGY",
  ONCOLOGY = "ONCOLOGY",
  NEUROLOGY = "NEUROLOGY",
  ORTHOPEDICS = "ORTHOPEDICS",
  GENERAL = "GENERAL",
}

/** Urgency level assigned during case classification. */
export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

/** Human review actions when a case needs manual approval or override. */
export enum ReviewDecision {
  APPROVE = "APPROVE",
  OVERRIDE = "OVERRIDE",
}

/** Who produced a timeline event. */
export enum EventSource {
  SYSTEM = "SYSTEM",
  LLM = "LLM",
  GUARDRAIL = "GUARDRAIL",
  HUMAN = "HUMAN",
}
