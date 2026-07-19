import type { CaseEvent } from "../generated/prisma/index.js";

export type CaseEventWriter = (event: CaseEvent) => void;

/**
 * Buffers live events while persisted history is being read, then emits the
 * combined timeline once in sequence order. Persisted and live delivery can
 * overlap, so sequence numbers are deduplicated before writing.
 */
export class CaseEventReplayBuffer {
  private readonly buffered: CaseEvent[] = [];
  private readonly emittedSequences = new Set<number>();
  private replaying = true;

  constructor(
    private readonly afterSequence: number,
    private readonly write: CaseEventWriter,
  ) {}

  pushLive(event: CaseEvent): void {
    if (event.sequence <= this.afterSequence || this.emittedSequences.has(event.sequence)) {
      return;
    }

    if (this.replaying) {
      this.buffered.push(event);
      return;
    }

    this.emitOnce(event);
  }

  completeReplay(persistedEvents: readonly CaseEvent[]): void {
    for (const event of [...persistedEvents].sort(bySequence)) {
      this.emitOnce(event);
    }

    // Drain until empty so an event synchronously queued while writing another
    // event cannot be stranded when replay mode ends.
    while (this.buffered.length > 0) {
      const batch = this.buffered.splice(0).sort(bySequence);
      for (const event of batch) {
        this.emitOnce(event);
      }
    }

    this.replaying = false;
  }

  private emitOnce(event: CaseEvent): void {
    if (event.sequence <= this.afterSequence || this.emittedSequences.has(event.sequence)) {
      return;
    }
    this.emittedSequences.add(event.sequence);
    this.write(event);
  }
}

function bySequence(a: CaseEvent, b: CaseEvent): number {
  return a.sequence - b.sequence;
}
