/**
 * U5 — Orchestrator. Sequences stages in-process (fire-and-forget, Q2=A), resumes after human
 * review, and reassigns a specialist's open cases after PTO. Any thrown error is caught and turned
 * into a terminal FAILED state (never silent). The LlmClient is injected so U6 can wire it and
 * later tests can mock it at the adapter boundary.
 */
import type { Case } from "../generated/prisma/index.js";
import { CaseStatus } from "../generated/prisma/index.js";
import { caseRepository } from "../db/repositories/caseRepository.js";
import { commandRepository } from "../db/repositories/commandRepository.js";
import type { LlmClient } from "../llm/index.js";
import { LlmError } from "../llm/index.js";
import type { Department, Priority, ReviewDecision } from "../types.js";
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
  action: ReviewDecision;
  overrideCategory?: Department;
  overridePriority?: Priority;
};

export type Orchestrator = {
  runPipeline(caseId: string, rawText: string): Promise<void>;
  resumeAfterReview(caseId: string, command: ReviewCommand): Promise<void>;
  reassignForSpecialist(specialistId: string): Promise<void>;
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
      // Idempotency: a replayed review command must not assign twice.
      const alreadyProcessed = await commandRepository.findByCommandId(command.commandId);
      if (alreadyProcessed) {
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
        approve: command.action === ("APPROVE" as ReviewDecision),
        overrideCategory: command.overrideCategory,
        overridePriority: command.overridePriority,
      });

      await assignStage(llm, reviewed.case);
    } catch (err) {
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

  return { runPipeline, resumeAfterReview, reassignForSpecialist };
}
