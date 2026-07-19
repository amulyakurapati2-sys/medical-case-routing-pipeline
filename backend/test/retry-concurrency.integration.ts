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
  test("retry concurrency integration tests", { skip: "TEST_DATABASE_URL is not set" }, () => {});
} else {
  assertIsolatedTestDatabase(testDatabaseUrl);
  process.env.DATABASE_URL = testDatabaseUrl;

  const { prisma } = await import("../src/db/prisma.js");
  const {
    CaseEventType,
    CaseStatus,
    Department,
    EventSource,
    Priority,
  } = await import("../src/generated/prisma/index.js");
  const { CaseStateConflictError } = await import(
    "../src/db/repositories/caseRepository.js"
  );
  const { retryStage } = await import("../src/pipeline/stages.js");

  const caseIds = new Set<string>();
  const commandIds = new Set<string>();

  async function createUnassignableCase() {
    const created = await prisma.case.create({
      data: {
        scrubbedText: "Synthetic case for retry concurrency testing",
        status: CaseStatus.UNASSIGNABLE,
        category: Department.CARDIOLOGY,
        priority: Priority.MEDIUM,
        requiredExpertise: ["cardiology"],
        summary: "Synthetic retry test case",
        confidence: 0.9,
        events: {
          create: {
            sequence: 1,
            type: CaseEventType.UNASSIGNABLE,
            summary: "No eligible specialist",
            source: EventSource.SYSTEM,
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

  test("only one of two different retries can advance an unassignable case", async () => {
    const caseRow = await createUnassignableCase();
    const firstCommandId = randomUUID();
    const secondCommandId = randomUUID();
    commandIds.add(firstCommandId);
    commandIds.add(secondCommandId);

    const results = await Promise.allSettled([
      retryStage(caseRow.id, firstCommandId),
      retryStage(caseRow.id, secondCommandId),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.reason instanceof CaseStateConflictError);

    const [persistedCase, retryEvents, persistedCommands] = await Promise.all([
      prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } }),
      prisma.caseEvent.findMany({
        where: { caseId: caseRow.id, summary: "Assignment retry requested" },
      }),
      prisma.processedCommand.findMany({
        where: { commandId: { in: [firstCommandId, secondCommandId] } },
      }),
    ]);

    assert.equal(persistedCase.status, CaseStatus.CLASSIFIED);
    assert.equal(retryEvents.length, 1);
    assert.equal(persistedCommands.length, 1);
  });

  test("two concurrent deliveries of one retry command create one transition", async () => {
    const caseRow = await createUnassignableCase();
    const commandId = randomUUID();
    commandIds.add(commandId);

    const results = await Promise.all([
      retryStage(caseRow.id, commandId),
      retryStage(caseRow.id, commandId),
    ]);

    assert.equal(results.filter((result) => result.replayed).length, 1);
    assert.equal(results.filter((result) => !result.replayed).length, 1);

    const [retryEventCount, commandCount] = await Promise.all([
      prisma.caseEvent.count({
        where: { caseId: caseRow.id, summary: "Assignment retry requested" },
      }),
      prisma.processedCommand.count({ where: { commandId } }),
    ]);

    assert.equal(retryEventCount, 1);
    assert.equal(commandCount, 1);
  });

  test("an accepted retry remains replayable after the case moves forward", async () => {
    const caseRow = await createUnassignableCase();
    const commandId = randomUUID();
    commandIds.add(commandId);

    await retryStage(caseRow.id, commandId);
    await prisma.case.update({
      where: { id: caseRow.id },
      data: { status: CaseStatus.ASSIGNED },
    });

    const replay = await retryStage(caseRow.id, commandId);

    assert.equal(replay.replayed, true);
    assert.equal(replay.case.status, CaseStatus.ASSIGNED);
    assert.equal(
      await prisma.caseEvent.count({
        where: { caseId: caseRow.id, summary: "Assignment retry requested" },
      }),
      1,
    );
  });
}
