/**
 * U6 — Case routes: submit, list, inspect, and human review.
 * Business logic lives in U5; these handlers validate input and delegate (API-10).
 */
import type { FastifyPluginAsync } from "fastify";
import { caseRepository } from "../db/repositories/caseRepository.js";
import type { Orchestrator } from "../pipeline/index.js";
import { CreateCaseBody, ReviewBody, parseBody } from "./schemas.js";

type CasesDeps = { orchestrator: Orchestrator };

export const casesRoutes: FastifyPluginAsync<CasesDeps> = async (app, opts) => {
  const { orchestrator } = opts;

  // FR-1 — submit. Raw text is passed to the pipeline in memory and never stored.
  app.post("/cases", async (req, reply) => {
    const body = parseBody(CreateCaseBody, req.body);
    const { case: created } = await caseRepository.createReceived();
    void orchestrator.runPipeline(created.id, body.text);
    return reply.code(201).send({ id: created.id });
  });

  // FR-7.2 — list.
  app.get("/cases", async () => {
    return caseRepository.findAll();
  });

  // FR-7.1 — inspect with full timeline.
  app.get("/cases/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await caseRepository.findByIdWithEvents(id);
    if (!found) {
      return reply
        .code(404)
        .send({ error: "Not Found", message: `Case ${id} not found`, status: 404 });
    }
    return found;
  });

  // FR-5 — human review; fire-and-forget resume, idempotent via commandId.
  app.post("/cases/:id/review", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(ReviewBody, req.body);
    void orchestrator.resumeAfterReview(id, {
      commandId: body.commandId,
      action: body.action,
      overrideCategory: body.overrideCategory,
      overridePriority: body.overridePriority,
    });
    return reply.code(202).send({ accepted: true });
  });
};
