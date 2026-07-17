/**
 * Shared types for repository inputs/outputs, especially appendEventAndProject.
 */
import type {
  Case,
  CaseEvent,
  CaseEventType,
  CaseStatus,
  Department,
  EventSource,
  Priority,
  Prisma,
} from "../../generated/prisma/index.js";

export type CasePatch = {
  status?: CaseStatus;
  scrubbedText?: string;
  category?: Department | null;
  priority?: Priority | null;
  requiredExpertise?: string[];
  summary?: string | null;
  confidence?: number | null;
  assignedSpecialistId?: string | null;
};

export type AppendEventInput = {
  caseId: string;
  type: CaseEventType;
  summary: string;
  reasoning?: string | null;
  data?: Prisma.InputJsonValue;
  source: EventSource;
  llmMeta?: Prisma.InputJsonValue | null;
  causationId?: string | null;
  casePatch: CasePatch;
  /** When set, stored in ProcessedCommand in the same transaction (idempotency). */
  command?: {
    commandId: string;
    kind: string;
    resourceType: string;
    resourceId: string;
    resultSummary?: Prisma.InputJsonValue;
  };
};

export type AppendEventResult = {
  case: Case;
  event: CaseEvent;
};

export type CreateCaseInput = {
  /** Optional; receive stage usually starts empty until scrub. */
  scrubbedText?: string;
};
