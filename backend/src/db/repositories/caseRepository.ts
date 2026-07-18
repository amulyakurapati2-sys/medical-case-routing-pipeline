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
import type {
  AppendEventInput,
  AppendEventResult,
  CreateCaseInput,
} from "./types.js";

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

      return { case: created, event };
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
      if (input.command) {
        const existing = await tx.processedCommand.findUnique({
          where: { commandId: input.command.commandId },
        });
        if (existing) {
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
          return { case: current, event: lastEvent };
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

      if (input.command) {
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

      return { case: caseRow, event };
    });
  },
};
