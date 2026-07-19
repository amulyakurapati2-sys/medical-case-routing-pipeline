/**
 * Case persistence helpers, including transactional event append + case update.
 */
import type { Case, CaseEvent, Prisma } from "../../generated/prisma/index.js";
import {
  CaseEventType,
  CaseStatus,
  EventSource,
} from "../../generated/prisma/index.js";
import { prisma } from "../prisma.js";
import {
  assignmentRejectionReason,
  AssignmentEligibilityError,
} from "./assignmentEligibility.js";
import { assertCommandMatches } from "./idempotency.js";
import type {
  AppendEventInput,
  AppendEventResult,
  CreateCaseInput,
} from "./types.js";

export class CaseNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(caseId: string) {
    super(`Case ${caseId} not found`);
    this.name = "CaseNotFoundError";
  }
}

export class CaseStateConflictError extends Error {
  readonly statusCode = 409;

  constructor(caseId: string, expected: CaseStatus) {
    super(`Case ${caseId} is not in ${expected}`);
    this.name = "CaseStateConflictError";
  }
}

export const caseRepository = {
  /**
   * Create a case in RECEIVED and append the first timeline event in one
   * transaction. Original submission text is never stored — only scrubbed text.
   */
  async createReceived(input: CreateCaseInput = {}): Promise<AppendEventResult> {
    return prisma.$transaction(async (tx) => {
      const created = await tx.case.create({
        data: {
          scrubbedText: input.scrubbedText ?? "",
          status: CaseStatus.RECEIVED,
        },
      });

      const event = await tx.caseEvent.create({
        data: {
          caseId: created.id,
          sequence: 1,
          type: CaseEventType.RECEIVED,
          summary: "Case received",
          reasoning: null,
          data: {},
          source: EventSource.SYSTEM,
        },
      });

      return { case: created, event, replayed: false };
    });
  },

  async findById(id: string): Promise<Case | null> {
    return prisma.case.findUnique({ where: { id } });
  },

  async findByIdWithEvents(
    id: string,
  ): Promise<(Case & { events: CaseEvent[] }) | null> {
    return prisma.case.findUnique({
      where: { id },
      include: { events: { orderBy: { sequence: "asc" } } },
    });
  },

  /** Events for a case with sequence greater than `sequence` — for SSE Last-Event-ID replay. */
  async getEventsAfter(id: string, sequence: number): Promise<CaseEvent[]> {
    return prisma.caseEvent.findMany({
      where: { caseId: id, sequence: { gt: sequence } },
      orderBy: { sequence: "asc" },
    });
  },

  async findAll(): Promise<Case[]> {
    return prisma.case.findMany({ orderBy: { createdAt: "desc" } });
  },

  async findOpenBySpecialist(specialistId: string): Promise<Case[]> {
    return prisma.case.findMany({
      where: {
        assignedSpecialistId: specialistId,
        status: { in: [CaseStatus.ASSIGNED, CaseStatus.REASSIGNED] },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  /**
   * Advance a case: allocate the next sequence number, insert a CaseEvent,
   * update the Case projection, and optionally record a ProcessedCommand —
   * all in one database transaction.
   */
  async appendEventAndProject(
    input: AppendEventInput,
  ): Promise<AppendEventResult> {
    return prisma.$transaction(async (tx) => {
      // Serialize all transitions for this case. Without the row lock, two
      // transactions can both calculate the same MAX(sequence) + 1.
      const locked = await tx.$queryRaw<Array<{ id: string; status: CaseStatus }>>`
        SELECT "id", "status" FROM "cases" WHERE "id" = ${input.caseId} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new CaseNotFoundError(input.caseId);
      }

      if (input.command) {
        const existing = await tx.processedCommand.findUnique({
          where: { commandId: input.command.commandId },
        });
        if (existing) {
          assertCommandMatches(existing, input.command);
          const current = await tx.case.findUniqueOrThrow({
            where: { id: input.caseId },
          });
          const lastEvent = await tx.caseEvent.findFirst({
            where: { caseId: input.caseId },
            orderBy: { sequence: "desc" },
          });
          if (!lastEvent) {
            throw new Error(
              `Idempotent command ${input.command.commandId} found but case has no events`,
            );
          }
          return { case: current, event: lastEvent, replayed: true };
        }

        // Reserve the command before taking any specialist lock. PTO updates
        // use the same command-then-specialist order, preventing lock cycles.
        await tx.processedCommand.create({
          data: {
            commandId: input.command.commandId,
            kind: input.command.kind,
            resourceType: input.command.resourceType,
            resourceId: input.command.resourceId,
            resultSummary: input.command.resultSummary ?? undefined,
          },
        });
      }

      if (
        input.expectedCaseStatus !== undefined &&
        locked[0]?.status !== input.expectedCaseStatus
      ) {
        throw new CaseStateConflictError(input.caseId, input.expectedCaseStatus);
      }

      if (input.assignmentGuard) {
        const specialistLock = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "specialists"
          WHERE "id" = ${input.assignmentGuard.specialistId}
          FOR UPDATE
        `;
        if (specialistLock.length === 0) {
          throw new AssignmentEligibilityError("Selected specialist no longer exists");
        }

        const specialist = await tx.specialist.findUniqueOrThrow({
          where: { id: input.assignmentGuard.specialistId },
        });
        const currentLoad = await tx.case.count({
          where: {
            id: { not: input.caseId },
            assignedSpecialistId: specialist.id,
            status: { in: [CaseStatus.ASSIGNED, CaseStatus.REASSIGNED] },
          },
        });
        const rejection = assignmentRejectionReason(
          specialist,
          input.assignmentGuard.department,
          currentLoad,
        );
        if (rejection) {
          throw new AssignmentEligibilityError(rejection);
        }
      }

      const agg = await tx.caseEvent.aggregate({
        where: { caseId: input.caseId },
        _max: { sequence: true },
      });
      const nextSequence = (agg._max.sequence ?? 0) + 1;

      const event = await tx.caseEvent.create({
        data: {
          caseId: input.caseId,
          sequence: nextSequence,
          type: input.type,
          summary: input.summary,
          reasoning: input.reasoning ?? null,
          data: input.data ?? {},
          source: input.source,
          llmMeta: input.llmMeta ?? undefined,
          causationId: input.causationId ?? null,
        },
      });

      const caseRow = await tx.case.update({
        where: { id: input.caseId },
        data: {
          ...input.casePatch,
        } as Prisma.CaseUpdateInput,
      });

      return { case: caseRow, event, replayed: false };
    });
  },
};
