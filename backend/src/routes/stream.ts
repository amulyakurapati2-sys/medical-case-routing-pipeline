/** Per-case SSE stream with persisted-event replay and heartbeat cleanup. */
import type { FastifyPluginAsync } from "fastify";
import { caseRepository } from "../db/repositories/caseRepository.js";
import type { CaseEventBus } from "../events/bus.js";
import { CaseEventReplayBuffer } from "../events/replayBuffer.js";
import type { CaseEvent } from "../generated/prisma/index.js";

type StreamDeps = { bus: CaseEventBus };

const HEARTBEAT_MS = 15_000;

export const streamRoutes: FastifyPluginAsync<StreamDeps> = async (app, opts) => {
  const { bus } = opts;

  app.get("/cases/:id/stream", async (req, reply) => {
    const { id } = req.params as { id: string };

    // Validate the case before hijacking the socket. Once hijacked, Fastify can
    // no longer send a normal JSON 404 response.
    const existingCase = await caseRepository.findById(id);
    if (!existingCase) {
      return reply.code(404).send({
        error: "Not Found",
        message: `Case ${id} not found`,
        status: 404,
      });
    }

    // Take over the socket; Fastify will not send its own response.
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    let closed = false;
    const write = (event: CaseEvent): void => {
      if (closed || reply.raw.destroyed) {
        return;
      }
      reply.raw.write(
        `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    };

    // Replay: from Last-Event-ID if present, otherwise the full timeline.
    const lastEventIdRaw =
      (req.headers["last-event-id"] as string | undefined) ??
      (req.query as { lastEventId?: string }).lastEventId;
    const parsedLastEventId = Number(lastEventIdRaw ?? 0);
    const lastEventId =
      Number.isSafeInteger(parsedLastEventId) && parsedLastEventId >= 0
        ? parsedLastEventId
        : 0;

    // Subscribe before querying history. Events committed during the query are
    // buffered, then merged with its result so the replay-to-live handoff has
    // no missed-event window.
    const replay = new CaseEventReplayBuffer(lastEventId, write);
    const unsubscribe = bus.subscribe(id, (event) => replay.pushLive(event));
    const heartbeat = setInterval(() => {
      if (!closed && !reply.raw.destroyed) {
        reply.raw.write(": heartbeat\n\n");
      }
    }, HEARTBEAT_MS);

    const cleanup = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.raw.once("close", cleanup);

    try {
      const persisted = await caseRepository.getEventsAfter(id, lastEventId);
      if (!closed) {
        replay.completeReplay(persisted);
      }
    } catch (error) {
      req.log.error({ err: error, caseId: id }, "SSE replay failed");
      const canEnd = !reply.raw.destroyed;
      cleanup();
      if (canEnd) {
        reply.raw.end();
      }
    }
  });
};
