import assert from "node:assert/strict";
import test from "node:test";
import { launchBackgroundTask } from "../src/pipeline/background.js";

test("detached task failures terminate in the configured handler", async () => {
  const expected = new Error("secondary database failure");

  const observed = await new Promise<{
    error: unknown;
    operation: string;
    caseId?: string;
  }>((resolve) => {
    launchBackgroundTask(
      Promise.reject(expected),
      { operation: "TEST_BACKGROUND_TASK", caseId: "case-1" },
      (error, context) => resolve({ error, ...context }),
    );
  });

  assert.equal(observed.error, expected);
  assert.equal(observed.operation, "TEST_BACKGROUND_TASK");
  assert.equal(observed.caseId, "case-1");
});

test("a throwing failure handler is contained", async () => {
  launchBackgroundTask(
    Promise.reject(new Error("task failure")),
    { operation: "TEST_LOGGER_FAILURE" },
    () => {
      throw new Error("logger failure");
    },
  );

  // Let the rejection handler run. The test process would fail if it escaped.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(true);
});
