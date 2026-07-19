import assert from "node:assert/strict";
import test from "node:test";
import { CaseEventReplayBuffer } from "../src/events/replayBuffer.js";
import {
  CaseEventType,
  EventSource,
  type CaseEvent,
} from "../src/generated/prisma/index.js";

function caseEvent(sequence: number): CaseEvent {
  return {
    id: `event-${sequence}`,
    caseId: "case-1",
    sequence,
    type: CaseEventType.RECEIVED,
    summary: `Event ${sequence}`,
    reasoning: null,
    data: {},
    source: EventSource.SYSTEM,
    llmMeta: null,
    causationId: null,
    createdAt: new Date(sequence * 1_000),
  };
}

test("events arriving during replay are emitted after persisted history", () => {
  const written: number[] = [];
  const replay = new CaseEventReplayBuffer(0, (event) => written.push(event.sequence));

  replay.pushLive(caseEvent(4));
  replay.completeReplay([caseEvent(1), caseEvent(2), caseEvent(3)]);

  assert.deepEqual(written, [1, 2, 3, 4]);
});

test("overlap between persisted and buffered events is deduplicated", () => {
  const written: number[] = [];
  const replay = new CaseEventReplayBuffer(0, (event) => written.push(event.sequence));

  replay.pushLive(caseEvent(3));
  replay.pushLive(caseEvent(4));
  replay.completeReplay([caseEvent(1), caseEvent(2), caseEvent(3)]);

  assert.deepEqual(written, [1, 2, 3, 4]);
});

test("live events write immediately after replay completes", () => {
  const written: number[] = [];
  const replay = new CaseEventReplayBuffer(0, (event) => written.push(event.sequence));

  replay.completeReplay([caseEvent(1)]);
  replay.pushLive(caseEvent(2));

  assert.deepEqual(written, [1, 2]);
});

test("Last-Event-ID excludes already delivered sequences", () => {
  const written: number[] = [];
  const replay = new CaseEventReplayBuffer(2, (event) => written.push(event.sequence));

  replay.pushLive(caseEvent(2));
  replay.completeReplay([caseEvent(1), caseEvent(2), caseEvent(3)]);

  assert.deepEqual(written, [3]);
});
