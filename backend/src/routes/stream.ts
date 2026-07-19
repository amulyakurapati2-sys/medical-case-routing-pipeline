/** Per-case SSE stream with persisted-event replay and heartbeat cleanup. */
import type { FastifyPluginAsync } from "fastify";
import { caseRepository } from "../db/repositories/caseRepository.js";
import type { CaseEventBus } from "../events/bus.js";
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
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const write = (event: CaseEvent): void => {
      reply.raw.write(
        `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    };

    // Replay: from Last-Event-ID if present, otherwise the full timeline.
    const lastEventIdRaw =
      (req.headers["last-event-id"] as string | undefined) ??
      (req.query as { lastEventId?: string }).lastEventId;
    const lastEventId =
      lastEventIdRaw !== undefined ? Number(lastEventIdRaw) : undefined;

    if (lastEventId !== undefined && !Number.isNaN(lastEventId)) {
      const missed = await caseRepository.getEventsAfter(id, lastEventId);
      missed.forEach(write);
    } else {
      const found = await caseRepository.findByIdWithEvents(id);
      found?.events.forEach(write);
    }

    const unsubscribe = bus.subscribe(id, write);
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });
  });
};
