/**
 * Best-effort in-process event delivery keyed by case ID. PostgreSQL remains
 * the source of truth and the SSE endpoint replays persisted events.
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
