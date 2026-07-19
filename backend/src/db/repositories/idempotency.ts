import { isDeepStrictEqual } from "node:util";
import type {
  Prisma,
  ProcessedCommand,
} from "../../generated/prisma/index.js";

export class IdempotencyConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super("commandId was already used for a different operation");
    this.name = "IdempotencyConflictError";
  }
}

export function reviewCommandRecord(
  caseId: string,
  command: {
    approve: boolean;
    overrideCategory?: string;
    overridePriority?: string;
  },
): {
  kind: string;
  resourceType: string;
  resourceId: string;
  resultSummary: Prisma.InputJsonObject;
} {
  return {
    kind: "REVIEW",
    resourceType: "case",
    resourceId: caseId,
    resultSummary: {
      approve: command.approve,
      overrideCategory: command.overrideCategory ?? null,
      overridePriority: command.overridePriority ?? null,
    },
  };
}

export function retryCommandRecord(caseId: string): {
  kind: string;
  resourceType: string;
  resourceId: string;
} {
  return {
    kind: "RETRY_ASSIGNMENT",
    resourceType: "case",
    resourceId: caseId,
  };
}

export function assertCommandMatches(
  command: Pick<
    ProcessedCommand,
    "kind" | "resourceType" | "resourceId" | "resultSummary"
  >,
  expected: {
    kind: string;
    resourceType: string;
    resourceId: string;
    resultSummary?: Prisma.InputJsonValue;
  },
): void {
  const differentIdentity =
    command.kind !== expected.kind ||
    command.resourceType !== expected.resourceType ||
    command.resourceId !== expected.resourceId;
  const differentPayload =
    command.resultSummary !== null &&
    expected.resultSummary !== undefined &&
    !isDeepStrictEqual(command.resultSummary, expected.resultSummary);

  if (differentIdentity || differentPayload) {
    throw new IdempotencyConflictError();
  }
}
