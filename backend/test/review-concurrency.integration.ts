import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function assertIsolatedTestDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const schema = parsed.searchParams.get("schema");

  if (!schema || !/^test_[a-z0-9_]+$/i.test(schema)) {
    throw new Error(
      "TEST_DATABASE_URL must select an isolated schema whose name starts with test_",
    );
  }
}

if (!testDatabaseUrl) {
  test("review concurrency integration tests", { skip: "TEST_DATABASE_URL is not set" }, () => {});
} else {
  assertIsolatedTestDatabase(testDatabaseUrl);
  process.env.DATABASE_URL = testDatabaseUrl;

  // These imports must happen after DATABASE_URL points at the isolated test
  // schema because the repository creates its shared Prisma client on import.
  const { prisma } = await import("../src/db/prisma.js");
  const {
    CaseEventType,
    CaseStatus,
    Department,
    EventSource,
    Priority,
  } = await import("../src/generated/prisma/index.js");
  const {
    CaseStateConflictError,
  } = await import("../src/db/repositories/caseRepository.js");
  const { reviewStage } = await import("../src/pipeline/stages.js");

  const caseIds = new Set<string>();
  const commandIds = new Set<string>();

  async function createCaseAwaitingReview() {
    const created = await prisma.case.create({
      data: {
        scrubbedText: "Synthetic case for concurrency testing",
        status: CaseStatus.NEEDS_REVIEW,
        category: Department.CARDIOLOGY,
        priority: Priority.MEDIUM,
        requiredExpertise: ["cardiology"],
        summary: "Synthetic test case",
        confidence: 0.5,
        events: {
          create: {
            sequence: 1,
            type: CaseEventType.NEEDS_REVIEW,
            summary: "Needs human review",
            source: EventSource.GUARDRAIL,
            data: {},
          },
        },
      },
    });
    caseIds.add(created.id);
    return created;
  }

  afterEach(async () => {
    await prisma.processedCommand.deleteMany({
      where: { commandId: { in: [...commandIds] } },
    });
    await prisma.case.deleteMany({ where: { id: { in: [...caseIds] } } });
    commandIds.clear();
    caseIds.clear();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  test("only one of two concurrent review decisions can advance a case", async () => {
    const caseRow = await createCaseAwaitingReview();
    const approveCommandId = randomUUID();
    const overrideCommandId = randomUUID();
    commandIds.add(approveCommandId);
    commandIds.add(overrideCommandId);

    const results = await Promise.allSettled([
      reviewStage(caseRow.id, {
        commandId: approveCommandId,
        approve: true,
      }),
      reviewStage(caseRow.id, {
        commandId: overrideCommandId,
        approve: false,
        overrideCategory: Department.NEPHROLOGY,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.reason instanceof CaseStateConflictError);

    const [persistedCase, reviewEvents, persistedCommands] = await Promise.all([
      prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } }),
      prisma.caseEvent.findMany({
        where: {
          caseId: caseRow.id,
          type: CaseEventType.CLASSIFIED,
          source: EventSource.HUMAN,
        },
      }),
      prisma.processedCommand.findMany({
        where: { commandId: { in: [approveCommandId, overrideCommandId] } },
      }),
    ]);

    assert.equal(persistedCase.status, CaseStatus.CLASSIFIED);
    assert.equal(reviewEvents.length, 1);
    assert.equal(persistedCommands.length, 1);
  });

  test("two concurrent deliveries of one review command create one transition", async () => {
    const caseRow = await createCaseAwaitingReview();
    const commandId = randomUUID();
    commandIds.add(commandId);
    const command = { commandId, approve: true };

    const results = await Promise.all([
      reviewStage(caseRow.id, command),
      reviewStage(caseRow.id, command),
    ]);

    assert.equal(results.filter((result) => result.replayed).length, 1);
    assert.equal(results.filter((result) => !result.replayed).length, 1);

    const [reviewEventCount, commandCount] = await Promise.all([
      prisma.caseEvent.count({
        where: {
          caseId: caseRow.id,
          type: CaseEventType.CLASSIFIED,
          source: EventSource.HUMAN,
        },
      }),
      prisma.processedCommand.count({ where: { commandId } }),
    ]);

    assert.equal(reviewEventCount, 1);
    assert.equal(commandCount, 1);
  });
}
