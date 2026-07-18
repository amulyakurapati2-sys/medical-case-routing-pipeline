/**
 * Frontend view models mirroring the backend DTOs (see backend/src/types.ts + Prisma models).
 * Kept as string-literal unions to stay dependency-free; values match the backend exactly.
 */

export type CaseStatus =
  | "RECEIVED"
  | "SCRUBBED"
  | "CLASSIFIED"
  | "NEEDS_REVIEW"
  | "ASSIGNED"
  | "REASSIGNED"
  | "UNASSIGNABLE"
  | "FAILED";

export type CaseEventType = CaseStatus;

export type Department =
  | "CARDIOLOGY"
  | "NEPHROLOGY"
  | "ONCOLOGY"
  | "NEUROLOGY"
  | "ORTHOPEDICS"
  | "GENERAL";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReviewDecision = "APPROVE" | "OVERRIDE";

export type EventSource = "SYSTEM" | "LLM" | "GUARDRAIL" | "HUMAN";

export const CASE_EVENT_TYPES: readonly CaseEventType[] = [
  "RECEIVED",
  "SCRUBBED",
  "CLASSIFIED",
  "NEEDS_REVIEW",
  "ASSIGNED",
  "REASSIGNED",
  "UNASSIGNABLE",
  "FAILED",
];

export const DEPARTMENTS: readonly Department[] = [
  "CARDIOLOGY",
  "NEPHROLOGY",
  "ONCOLOGY",
  "NEUROLOGY",
  "ORTHOPEDICS",
  "GENERAL",
];

export const PRIORITIES: readonly Priority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

/** Type-specific payload carried on a CaseEvent (all fields best-effort at read time). */
export interface EventData {
  redactions?: Record<string, number>;
  redactionCount?: number;
  category?: Department;
  priority?: Priority;
  requiredExpertise?: string[];
  summary?: string;
  confidence?: number;
  specialistId?: string;
}

export interface LlmMeta {
  model?: string;
  latencyMs?: number;
  retries?: number;
}

export interface CaseEventVM {
  id: string;
  caseId: string;
  sequence: number;
  type: CaseEventType;
  summary: string;
  reasoning: string | null;
  data: EventData;
  source: EventSource;
  llmMeta: LlmMeta | null;
  causationId: string | null;
  createdAt: string;
}

export interface CaseSummary {
  id: string;
  status: CaseStatus;
  category: Department | null;
  priority: Priority | null;
  confidence: number | null;
  summary: string | null;
  assignedSpecialistId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseDetail extends CaseSummary {
  scrubbedText: string;
  requiredExpertise: string[];
  events: CaseEventVM[];
}

export interface SpecialistVM {
  id: string;
  name: string;
  title: string;
  department: Department;
  expertise: string[];
  profile: string;
  onPto: boolean;
  maxCapacity: number;
  currentLoad: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRequest {
  commandId: string;
  action: ReviewDecision;
  overrideCategory?: Department;
  overridePriority?: Priority;
}

export interface PtoRequest {
  commandId: string;
  onPto: boolean;
}

export interface RetryCaseRequest {
  commandId: string;
}
