/**
 * U5 — In-process event bus (Q1=A). Typed wrapper over Node's EventEmitter, keyed by caseId.
 *
 * The database is the source of truth; this bus is best-effort real-time delivery. U6's SSE
 * endpoint replays any events missed during a disconnect by reading from the repository.
 */
import { EventEmitter } from "node:events";
import type { CaseEvent } from "../generated/prisma/index.js";

export type CaseEventHandler = (event: CaseEvent) => void;

export class CaseEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Many concurrent SSE subscribers per case are expected; disable the warning cap.
    this.emitter.setMaxListeners(0);
  }

  publish(caseId: string, event: CaseEvent): void {
    this.emitter.emit(caseId, event);
  }

  /** Subscribe to a case's events; returns an unsubscribe function. */
  subscribe(caseId: string, handler: CaseEventHandler): () => void {
    this.emitter.on(caseId, handler);
    return () => {
      this.emitter.off(caseId, handler);
    };
  }
}

/** Shared singleton bus for the process. */
export const bus = new CaseEventBus();
