/**
 * Specialist persistence and derived workload counts.
 *
 * Current load is counted from open assigned cases — not a stored counter
 * that can drift out of sync.
 */
import type {
  Department,
  ProcessedCommand,
  Specialist,
} from "../../generated/prisma/index.js";
import { CaseStatus, Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../prisma.js";

const OPEN_ASSIGNMENT_STATUSES: CaseStatus[] = [
  CaseStatus.ASSIGNED,
  CaseStatus.REASSIGNED,
];

async function getDerivedLoad(id: string): Promise<number> {
  return prisma.case.count({
    where: {
      assignedSpecialistId: id,
      status: { in: OPEN_ASSIGNMENT_STATUSES },
    },
  });
}

export class IdempotencyConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super("commandId was already used for a different operation");
    this.name = "IdempotencyConflictError";
  }
}

export function assertPtoCommandMatches(
  command: Pick<
    ProcessedCommand,
    "kind" | "resourceType" | "resourceId" | "resultSummary"
  >,
  expected: { specialistId: string; onPto: boolean },
): void {
  const recordedOnPto = readRecordedOnPto(command.resultSummary);
  if (
    command.kind !== "PTO" ||
    command.resourceType !== "specialist" ||
    command.resourceId !== expected.specialistId ||
    (recordedOnPto !== undefined && recordedOnPto !== expected.onPto)
  ) {
    throw new IdempotencyConflictError();
  }
}

function readRecordedOnPto(value: Prisma.JsonValue | null): boolean | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return typeof value.onPto === "boolean" ? value.onPto : undefined;
}

type AvailabilityCommandResult = {
  specialist: Specialist;
  becameUnavailable: boolean;
};

async function replayAvailabilityCommand(input: {
  commandId: string;
  specialistId: string;
  onPto: boolean;
}): Promise<AvailabilityCommandResult> {
  const command = await prisma.processedCommand.findUniqueOrThrow({
    where: { commandId: input.commandId },
  });
  assertPtoCommandMatches(command, input);

  const specialist = await prisma.specialist.findUniqueOrThrow({
    where: { id: input.specialistId },
  });
  return { specialist, becameUnavailable: false };
}

export const specialistRepository = {
  async findAll(): Promise<Specialist[]> {
    return prisma.specialist.findMany({
      orderBy: [{ department: "asc" }, { name: "asc" }],
    });
  },

  async findById(id: string): Promise<Specialist | null> {
    return prisma.specialist.findUnique({ where: { id } });
  },

  /** Atomically apply availability and record its idempotency command. */
  async updateAvailabilityWithCommand(input: {
    commandId: string;
    specialistId: string;
    onPto: boolean;
  }): Promise<AvailabilityCommandResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const processed = await tx.processedCommand.findUnique({
          where: { commandId: input.commandId },
        });
        if (processed) {
          assertPtoCommandMatches(processed, input);
          const specialist = await tx.specialist.findUniqueOrThrow({
            where: { id: input.specialistId },
          });
          return { specialist, becameUnavailable: false };
        }

        await tx.processedCommand.create({
          data: {
            commandId: input.commandId,
            kind: "PTO",
            resourceType: "specialist",
            resourceId: input.specialistId,
            resultSummary: { onPto: input.onPto },
          },
        });

        // The condition is evaluated while PostgreSQL updates the row. If two
        // different commands request the same value concurrently, only one
        // changes it and therefore only one triggers reassignment.
        const change = await tx.specialist.updateMany({
          where: { id: input.specialistId, onPto: { not: input.onPto } },
          data: { onPto: input.onPto },
        });
        const specialist = await tx.specialist.findUniqueOrThrow({
          where: { id: input.specialistId },
        });
        return {
          specialist,
          becameUnavailable: change.count === 1 && input.onPto,
        };
      });
    } catch (error) {
      // Concurrent requests can both pass the initial lookup, but only one can
      // insert the command ID. The loser resolves as a replay after the winner
      // commits instead of leaking a unique-constraint error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return replayAvailabilityCommand(input);
      }
      throw error;
    }
  },

  /** Number of open cases currently assigned to this specialist. */
  getDerivedLoad,

  /**
   * Candidates for assignment: matching department, not on PTO, under capacity.
   * Expertise matching can be narrowed with `expertiseContains` when callers
   * already know required tags; otherwise department + PTO + capacity apply.
   */
  async findEligibleByDepartment(
    department: Department,
    options?: { expertiseContains?: string[] },
  ): Promise<(Specialist & { currentLoad: number })[]> {
    const specialists = await prisma.specialist.findMany({
      where: {
        department,
        onPto: false,
        ...(options?.expertiseContains?.length
          ? { expertise: { hasEvery: options.expertiseContains } }
          : {}),
      },
      orderBy: { name: "asc" },
    });

    const withLoad = await Promise.all(
      specialists.map(async (s) => ({
        ...s,
        currentLoad: await getDerivedLoad(s.id),
      })),
    );

    return withLoad.filter((s) => s.currentLoad < s.maxCapacity);
  },
};
