/**
 * Pipeline stages persist each event and its case projection atomically, then
 * publish the committed event. The LLM ranks; deterministic rules decide.
 */
import type { Case, CaseEvent, Prisma, Specialist } from "../generated/prisma/index.js";
import {
  CaseEventType,
  CaseStatus,
  Department,
  EventSource,
  Priority,
} from "../generated/prisma/index.js";
import { caseRepository } from "../db/repositories/caseRepository.js";
import { AssignmentEligibilityError } from "../db/repositories/assignmentEligibility.js";
import {
  retryCommandRecord,
  reviewCommandRecord,
} from "../db/repositories/idempotency.js";
import { specialistRepository } from "../db/repositories/specialistRepository.js";
import type { AppendEventInput } from "../db/repositories/types.js";
import type { LlmClient } from "../llm/index.js";
import type { CandidateProfile, CaseInfo } from "../llm/schemas.js";
import {
  checkConfidence,
  groundClassification,
  groundMatch,
  scrub,
} from "../guardrails/index.js";
import { bus } from "../events/bus.js";
import { filterCandidates, mapCategoryToExpertise, veto } from "./rules.js";

export type StageDirective = "CONTINUE" | "PAUSE" | "TERMINAL";

export type StageResult = {
  case: Case;
  event: CaseEvent;
  next: StageDirective;
  replayed: boolean;
};

export type FailureDetails = {
  reason: string;
  data: Prisma.InputJsonObject;
  llmMeta?: Prisma.InputJsonObject;
};

/** Persist a transition transactionally, then publish the event to the bus. */
async function appendAndEmit(
  input: AppendEventInput,
  next: StageDirective,
): Promise<StageResult> {
  const { case: updated, event, replayed } =
    await caseRepository.appendEventAndProject(input);
  if (!replayed) {
    bus.publish(input.caseId, event);
  }
  return { case: updated, event, next: replayed ? "TERMINAL" : next, replayed };
}

function toCandidateProfile(s: Specialist): CandidateProfile {
  return {
    id: s.id,
    name: s.name,
    title: s.title,
    department: s.department,
    expertise: s.expertise,
    profile: s.profile,
  };
}

function buildCaseInfo(caseRow: Case): CaseInfo {
  if (!caseRow.category) {
    throw new Error("cannot build assignment input without a category");
  }
  return {
    category: caseRow.category,
    priority: caseRow.priority ?? Priority.MEDIUM,
    requiredExpertise: caseRow.requiredExpertise,
    summary: caseRow.summary ?? "",
    scrubbedText: caseRow.scrubbedText,
  };
}

/**
 * SCRUB — redact PHI from the in-memory raw text and persist ONLY the scrubbed text.
 * Raw submission text is never stored (privacy): it is passed in memory to the pipeline.
 */
export async function scrubStage(caseId: string, rawText: string): Promise<StageResult> {
  const { scrubbedText, redactions, redactionCount } = scrub(rawText);

  return appendAndEmit(
    {
      caseId,
      type: CaseEventType.SCRUBBED,
      summary:
        redactionCount > 0
          ? `Scrubbed input (${redactionCount} redaction(s))`
          : "Scrubbed input (no PHI detected)",
      data: { redactions, redactionCount },
      source: EventSource.GUARDRAIL,
      casePatch: { status: CaseStatus.SCRUBBED, scrubbedText },
    },
    "CONTINUE",
  );
}

/**
 * CLASSIFY — the LLM classifies scrubbed text; deterministic checks ground the
 * category and gate on confidence.
 * Grounding failure → throw (orchestrator fails the case). Low confidence → NEEDS_REVIEW (pause).
 */
export async function classifyStage(llm: LlmClient, caseRow: Case): Promise<StageResult> {
  const { result, llmMeta } = await llm.classifyCase(caseRow.scrubbedText);

  const grounding = groundClassification(String(result.category));
  if (!grounding.grounded) {
    throw new Error(`classification not grounded: ${grounding.violations.join("; ")}`);
  }

  const confidence = checkConfidence(result.confidence);

  const classificationData = {
    category: result.category,
    priority: result.priority,
    requiredExpertise: result.requiredExpertise,
    summary: result.summary,
    confidence: result.confidence,
  } satisfies Prisma.InputJsonObject;

  const casePatch = {
    category: result.category,
    priority: result.priority,
    requiredExpertise: result.requiredExpertise,
    summary: result.summary,
    confidence: result.confidence,
    status: confidence.passed ? CaseStatus.CLASSIFIED : CaseStatus.NEEDS_REVIEW,
  };

  if (confidence.passed) {
    return appendAndEmit(
      {
        caseId: caseRow.id,
        type: CaseEventType.CLASSIFIED,
        summary: `Classified as ${result.category} / ${result.priority}`,
        reasoning: result.reasoning,
        data: classificationData,
        source: EventSource.LLM,
        llmMeta: { ...llmMeta },
        casePatch,
      },
      "CONTINUE",
    );
  }

  return appendAndEmit(
    {
      caseId: caseRow.id,
      type: CaseEventType.NEEDS_REVIEW,
      summary: `Low confidence (${result.confidence.toFixed(2)} < ${confidence.threshold}) — needs human review`,
      reasoning: result.reasoning,
      data: classificationData,
      source: EventSource.GUARDRAIL,
      llmMeta: { ...llmMeta },
      casePatch,
    },
    "PAUSE",
  );
}

/**
 * REVIEW — record a human decision (idempotent via commandId) and return the case to CLASSIFIED
 * so the orchestrator can resume assignment. OVERRIDE applies a new category/priority.
 */
export async function reviewStage(
  caseId: string,
  command: {
    commandId: string;
    approve: boolean;
    reject?: boolean;
    overrideCategory?: Department;
    overridePriority?: Priority;
  },
): Promise<StageResult> {
  if (command.reject) {
    return appendAndEmit(
      {
        caseId,
        type: CaseEventType.UNASSIGNABLE,
        summary: "Human marked case as invalid — no assignment required",
        reasoning:
          "The reviewer determined that the submitted text is not a valid case for specialist routing.",
        data: { reason: "INVALID_CASE" },
        source: EventSource.HUMAN,
        casePatch: {
          status: CaseStatus.UNASSIGNABLE,
          assignedSpecialistId: null,
        },
        expectedCaseStatus: CaseStatus.NEEDS_REVIEW,
        command: {
          commandId: command.commandId,
          ...reviewCommandRecord(caseId, command),
        },
      },
      "TERMINAL",
    );
  }

  const casePatch: AppendEventInput["casePatch"] = { status: CaseStatus.CLASSIFIED };
  if (!command.approve && command.overrideCategory) {
    casePatch.category = command.overrideCategory;
    // A human department override replaces classifier-generated expertise from
    // the old department so stale tags cannot influence candidate ranking.
    casePatch.requiredExpertise = mapCategoryToExpertise(command.overrideCategory, []);
  }
  if (!command.approve && command.overridePriority) {
    casePatch.priority = command.overridePriority;
  }

  const summary = command.approve
    ? "Human approved classification"
    : `Human override → ${command.overrideCategory ?? "(no category change)"}`;

  return appendAndEmit(
    {
      caseId,
      type: CaseEventType.CLASSIFIED,
      summary,
      source: EventSource.HUMAN,
      data: {
        ...(command.overrideCategory ? { category: command.overrideCategory } : {}),
        ...(command.overridePriority ? { priority: command.overridePriority } : {}),
        ...(casePatch.requiredExpertise
          ? { requiredExpertise: casePatch.requiredExpertise }
          : {}),
      },
      casePatch,
      expectedCaseStatus: CaseStatus.NEEDS_REVIEW,
      command: {
        commandId: command.commandId,
        ...reviewCommandRecord(caseId, command),
      },
    },
    "CONTINUE",
  );
}

/**
 * RETRY — atomically accept an idempotent retry command and move an
 * unassignable case back to CLASSIFIED before asynchronous assignment resumes.
 */
export async function retryStage(
  caseId: string,
  commandId: string,
): Promise<StageResult> {
  return appendAndEmit(
    {
      caseId,
      type: CaseEventType.CLASSIFIED,
      summary: "Assignment retry requested",
      source: EventSource.HUMAN,
      casePatch: { status: CaseStatus.CLASSIFIED },
      expectedCaseStatus: CaseStatus.UNASSIGNABLE,
      command: {
        commandId,
        ...retryCommandRecord(caseId),
      },
    },
    "CONTINUE",
  );
}

/** Shared assign/reassign core: filter → match → ground → veto → decide. */
async function assignCore(
  llm: LlmClient,
  caseRow: Case,
  mode: "ASSIGN" | "REASSIGN",
  expectedCaseStatus?: CaseStatus,
): Promise<StageResult> {
  if (!caseRow.category) {
    throw new Error("cannot assign a case with no category");
  }

  const caseInfo = buildCaseInfo(caseRow);
  const eligible = await specialistRepository.findEligibleByDepartment(caseRow.category);
  const candidates = filterCandidates(caseInfo, eligible);

  const assignedType =
    mode === "REASSIGN" ? CaseEventType.REASSIGNED : CaseEventType.ASSIGNED;
  const assignedStatus =
    mode === "REASSIGN" ? CaseStatus.REASSIGNED : CaseStatus.ASSIGNED;

  async function commitAssignment(
    chosen: Specialist,
    reasoning: string,
    selectionMethod: "SINGLE_ELIGIBLE_CANDIDATE" | "LLM_RANKED",
    llmMeta?: Prisma.InputJsonObject,
  ): Promise<StageResult> {
    try {
      return await appendAndEmit(
        {
          caseId: caseRow.id,
          type: assignedType,
          summary: `${mode === "REASSIGN" ? "Reassigned" : "Assigned"} to ${chosen.name} (${chosen.title})`,
          reasoning,
          data: { specialistId: chosen.id, selectionMethod },
          source: EventSource.SYSTEM,
          ...(llmMeta ? { llmMeta } : {}),
          casePatch: { status: assignedStatus, assignedSpecialistId: chosen.id },
          assignmentGuard: {
            specialistId: chosen.id,
            department: caseRow.category!,
          },
          expectedCaseStatus,
        },
        "TERMINAL",
      );
    } catch (error) {
      if (!(error instanceof AssignmentEligibilityError)) {
        throw error;
      }

      return appendAndEmit(
        {
          caseId: caseRow.id,
          type: CaseEventType.UNASSIGNABLE,
          summary: "Selected specialist became unavailable",
          reasoning: error.reason,
          source: EventSource.GUARDRAIL,
          ...(llmMeta ? { llmMeta } : {}),
          casePatch: { status: CaseStatus.UNASSIGNABLE, assignedSpecialistId: null },
          expectedCaseStatus,
        },
        "TERMINAL",
      );
    }
  }

  if (candidates.length === 0) {
    return appendAndEmit(
      {
        caseId: caseRow.id,
        type: CaseEventType.UNASSIGNABLE,
        summary: "No eligible specialists available",
        reasoning: "All matching specialists are on PTO or at capacity",
        source: EventSource.SYSTEM,
        casePatch: { status: CaseStatus.UNASSIGNABLE, assignedSpecialistId: null },
        expectedCaseStatus,
      },
      "TERMINAL",
    );
  }

  if (candidates.length === 1) {
    return commitAssignment(
      candidates[0]!,
      "Only one specialist passed the deterministic department, availability, and capacity checks.",
      "SINGLE_ELIGIBLE_CANDIDATE",
    );
  }

  const profiles = candidates.map(toCandidateProfile);
  const { result: match, llmMeta } = await llm.matchSpecialist(caseInfo, profiles);

  const candidateIds = candidates.map((c) => c.id);
  const grounding = groundMatch(match, candidateIds);
  if (!grounding.grounded) {
    throw new Error(
      `validated model choice is not grounded: ${grounding.violations.join("; ")}`,
    );
  }

  const chosen = candidates.find((candidate) => candidate.id === match.specialistId);
  if (!chosen) {
    throw new Error("validated model choice is missing from the candidate list");
  }

  const vetoResult = veto(caseInfo, chosen, candidates);
  if (!vetoResult.pass) {
    throw new Error(
      `validated model choice failed the final veto: ${vetoResult.reason ?? "unknown reason"}`,
    );
  }

  return commitAssignment(
    chosen,
    match.reasoning,
    "LLM_RANKED",
    { ...llmMeta },
  );
}

/** ASSIGN — first-time routing to a specialist (or UNASSIGNABLE). */
export async function assignStage(
  llm: LlmClient,
  caseRow: Case,
  expectedCaseStatus?: CaseStatus,
): Promise<StageResult> {
  return assignCore(llm, caseRow, "ASSIGN", expectedCaseStatus);
}

/** REASSIGN — re-route an open case (e.g. after its specialist went on PTO). */
export async function reassignStageForCase(
  llm: LlmClient,
  caseRow: Case,
): Promise<StageResult> {
  return assignCore(llm, caseRow, "REASSIGN");
}

/** FAIL — terminal error state; never silent, safe reason only. */
export async function failStage(
  caseId: string,
  failure: FailureDetails,
  expectedCaseStatus?: CaseStatus,
): Promise<StageResult> {
  return appendAndEmit(
    {
      caseId,
      type: CaseEventType.FAILED,
      summary: "Processing failed",
      reasoning: failure.reason,
      data: failure.data,
      source: EventSource.SYSTEM,
      llmMeta: failure.llmMeta,
      casePatch: {
        status: CaseStatus.FAILED,
        assignedSpecialistId: null,
      },
      expectedCaseStatus,
    },
    "TERMINAL",
  );
}

export { mapCategoryToExpertise };
