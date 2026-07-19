/**
 * Sequences pipeline stages in process, resumes reviewed cases, and reassigns
 * work after PTO changes. Failures become inspectable terminal events.
 */
import type { Case, Department, Priority } from "../generated/prisma/index.js";
import { CaseStatus, Prisma } from "../generated/prisma/index.js";
import { caseRepository } from "../db/repositories/caseRepository.js";
import { commandRepository } from "../db/repositories/commandRepository.js";
import {
  assertCommandMatches,
  retryCommandRecord,
  reviewCommandRecord,
} from "../db/repositories/idempotency.js";
import type { LlmClient } from "../llm/index.js";
import { LlmError } from "../llm/index.js";
import {
  assignStage,
  classifyStage,
  failStage,
  reassignStageForCase,
  retryStage,
  reviewStage,
  scrubStage,
} from "./stages.js";

export type ReviewCommand = {
  commandId: string;
  approve: boolean;
  overrideCategory?: Department;
  overridePriority?: Priority;
};

export type Orchestrator = {
  runPipeline(caseId: string, rawText: string): Promise<void>;
  resumeAfterReview(caseId: string, command: ReviewCommand): Promise<void>;
  reassignForSpecialist(specialistId: string): Promise<void>;
  retryUnassignable(caseId: string, commandId: string): Promise<void>;
};

/** Produce a client-safe failure reason (no secrets, no raw PHI). */
function safeReason(err: unknown): string {
  if (err instanceof LlmError) {
    return err.message;
  }
  return "Internal pipeline error";
}

/** Resolve a concurrent global commandId reservation as replay or conflict. */
async function resolveCommandReservationRace(
  error: unknown,
  commandId: string,
  expected: Parameters<typeof assertCommandMatches>[1],
): Promise<void> {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    throw error;
  }

  const existing = await commandRepository.findByCommandId(commandId);
  if (!existing) {
    throw error;
  }
  assertCommandMatches(existing, expected);
}

export function createOrchestrator(deps: { llm: LlmClient }): Orchestrator {
  const { llm } = deps;

  async function runPipeline(caseId: string, rawText: string): Promise<void> {
    try {
      const caseRow = await caseRepository.findById(caseId);
      if (!caseRow) {
        throw new Error(`case ${caseId} not found`);
      }

      const scrubbed = await scrubStage(caseId, rawText);
      const classified = await classifyStage(llm, scrubbed.case);

      // PAUSE means NEEDS_REVIEW — wait for a human decision before assigning.
      if (classified.next !== "CONTINUE") {
        return;
      }

      await assignStage(llm, classified.case);
    } catch (err) {
      await failStage(caseId, safeReason(err));
    }
  }

  async function resumeAfterReview(
    caseId: string,
    command: ReviewCommand,
  ): Promise<void> {
    let reviewed: Awaited<ReturnType<typeof reviewStage>>;
    try {
      reviewed = await reviewStage(caseId, {
        commandId: command.commandId,
        approve: command.approve,
        overrideCategory: command.overrideCategory,
        overridePriority: command.overridePriority,
      });
    } catch (error) {
      // Two requests for different cases can race to reserve the same global
      // commandId without sharing a case-row lock. Resolve the unique-key loser
      // as an idempotent replay or a 409 conflict.
      await resolveCommandReservationRace(
        error,
        command.commandId,
        reviewCommandRecord(caseId, command),
      );
      return;
    }

    if (reviewed.replayed) {
      return;
    }

    // The review command and state transition have committed. Continue the
    // potentially slow LLM-backed assignment without delaying the 202 response.
    void assignReviewedCase(reviewed.case);
  }

  async function assignReviewedCase(caseRow: Case): Promise<void> {
    try {
      await assignStage(llm, caseRow);
    } catch (err) {
      await failStage(caseRow.id, safeReason(err));
    }
  }

  async function reassignForSpecialist(specialistId: string): Promise<void> {
    const openCases: Case[] = await caseRepository.findOpenBySpecialist(specialistId);
    for (const caseRow of openCases) {
      try {
        await reassignStageForCase(llm, caseRow);
      } catch (err) {
        await failStage(caseRow.id, safeReason(err));
      }
    }
  }

  async function retryUnassignable(caseId: string, commandId: string): Promise<void> {
    let retried: Awaited<ReturnType<typeof retryStage>>;
    try {
      retried = await retryStage(caseId, commandId);
    } catch (error) {
      // Resolve a race to reserve a commandId exactly as the review flow does:
      // identical delivery is a replay; different usage is a synchronous 409.
      await resolveCommandReservationRace(
        error,
        commandId,
        retryCommandRecord(caseId),
      );
      return;
    }

    if (retried.replayed) {
      return;
    }

    void assignRetriedCase(retried.case);
  }

  async function assignRetriedCase(caseRow: Case): Promise<void> {
    try {
      await assignStage(llm, caseRow, CaseStatus.CLASSIFIED);
    } catch (err) {
      await failStage(caseRow.id, safeReason(err), CaseStatus.CLASSIFIED);
    }
  }

  return {
    runPipeline,
    resumeAfterReview,
    reassignForSpecialist,
    retryUnassignable,
  };
}
