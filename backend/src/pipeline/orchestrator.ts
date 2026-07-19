/**
 * Sequences pipeline stages in process, resumes reviewed cases, and reassigns
 * work after PTO changes. Failures become inspectable terminal events.
 */
import type { Case, Department, Priority } from "../generated/prisma/index.js";
import { CaseStatus } from "../generated/prisma/index.js";
import { caseRepository } from "../db/repositories/caseRepository.js";
import { commandRepository } from "../db/repositories/commandRepository.js";
import {
  assertCommandMatches,
  IdempotencyConflictError,
} from "../db/repositories/idempotency.js";
import type { LlmClient } from "../llm/index.js";
import { LlmError } from "../llm/index.js";
import {
  assignStage,
  classifyStage,
  failStage,
  reassignStageForCase,
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
    try {
      const commandRecord = {
        kind: "REVIEW",
        resourceType: "case",
        resourceId: caseId,
        resultSummary: {
          approve: command.approve,
          overrideCategory: command.overrideCategory ?? null,
          overridePriority: command.overridePriority ?? null,
        },
      };
      // Idempotency: a replayed review command must not assign twice.
      const alreadyProcessed = await commandRepository.findByCommandId(command.commandId);
      if (alreadyProcessed) {
        assertCommandMatches(alreadyProcessed, commandRecord);
        return;
      }

      const caseRow = await caseRepository.findById(caseId);
      if (!caseRow) {
        throw new Error(`case ${caseId} not found`);
      }
      if (caseRow.status !== CaseStatus.NEEDS_REVIEW) {
        // Nothing to resume (already handled or not awaiting review).
        return;
      }

      const reviewed = await reviewStage(caseId, {
        commandId: command.commandId,
        approve: command.approve,
        overrideCategory: command.overrideCategory,
        overridePriority: command.overridePriority,
      });

      if (reviewed.replayed) {
        return;
      }

      await assignStage(llm, reviewed.case);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return;
      }
      await failStage(caseId, safeReason(err));
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
    try {
      const commandRecord = {
        kind: "RETRY_ASSIGNMENT",
        resourceType: "case",
        resourceId: caseId,
      };
      const alreadyProcessed = await commandRepository.findByCommandId(commandId);
      if (alreadyProcessed) {
        assertCommandMatches(alreadyProcessed, commandRecord);
        return;
      }

      const caseRow = await caseRepository.findById(caseId);
      if (!caseRow || caseRow.status !== CaseStatus.UNASSIGNABLE) {
        return;
      }

      await assignStage(llm, caseRow, {
        commandId,
        ...commandRecord,
      });
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return;
      }
      await failStage(caseId, safeReason(err));
    }
  }

  return {
    runPipeline,
    resumeAfterReview,
    reassignForSpecialist,
    retryUnassignable,
  };
}
