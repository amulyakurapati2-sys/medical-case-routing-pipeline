/** Case submission, inspection, review, and retry routes. */
import type { FastifyPluginAsync } from "fastify";
import { caseRepository } from "../db/repositories/caseRepository.js";
import { commandRepository } from "../db/repositories/commandRepository.js";
import {
  assertCommandMatches,
  retryCommandRecord,
  reviewCommandRecord,
} from "../db/repositories/idempotency.js";
import type { Orchestrator } from "../pipeline/index.js";
import {
  CreateCaseBody,
  RetryCaseBody,
  ReviewBody,
  parseBody,
} from "./schemas.js";

type CasesDeps = { orchestrator: Orchestrator };

export const casesRoutes: FastifyPluginAsync<CasesDeps> = async (app, opts) => {
  const { orchestrator } = opts;

  // LLM-backed submission gets the strictest quota because it is the public
  // endpoint that consumes provider tokens. Limits are per client IP.
  app.post(
    "/cases",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = parseBody(CreateCaseBody, req.body);
      const { case: created } = await caseRepository.createReceived();
      void orchestrator.runPipeline(created.id, body.text);
      return reply.code(201).send({ id: created.id });
    },
  );

  app.get("/cases", async () => {
    return caseRepository.findAll();
  });

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

  app.post(
    "/cases/:id/review",
    { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = parseBody(ReviewBody, req.body);
      const command = {
        commandId: body.commandId,
        approve: body.action === "APPROVE",
        overrideCategory: body.overrideCategory,
        overridePriority: body.overridePriority,
      };
      const commandRecord = reviewCommandRecord(id, command);

      // Idempotency takes precedence over current state: an identical command
      // remains successful after its first execution moved the case forward.
      const existingCommand = await commandRepository.findByCommandId(body.commandId);
      if (existingCommand) {
        assertCommandMatches(existingCommand, commandRecord);
        return reply.code(202).send({ accepted: true });
      }

      const found = await caseRepository.findById(id);

      if (!found) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: `Case ${id} not found`, status: 404 });
      }
      if (found.status !== "NEEDS_REVIEW") {
        return reply.code(409).send({
          error: "Conflict",
          message: `Case ${id} is not awaiting review`,
          status: 409,
        });
      }

      // Await only the transactional review acceptance. The orchestrator starts
      // assignment asynchronously after the command and state change commit.
      await orchestrator.resumeAfterReview(id, command);
      return reply.code(202).send({ accepted: true });
    },
  );

  // Retry assignment for a previously unassignable case using its saved,
  // already-scrubbed classification. The raw submission is never needed again.
  app.post(
    "/cases/:id/retry",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = parseBody(RetryCaseBody, req.body);
      const commandRecord = retryCommandRecord(id);

      // As with review, idempotency takes precedence over current state. A
      // successfully accepted retry remains replayable after assignment.
      const existingCommand = await commandRepository.findByCommandId(body.commandId);
      if (existingCommand) {
        assertCommandMatches(existingCommand, commandRecord);
        return reply.code(202).send({ accepted: true });
      }

      const found = await caseRepository.findById(id);

      if (!found) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: `Case ${id} not found`, status: 404 });
      }
      if (found.status !== "UNASSIGNABLE") {
        return reply.code(409).send({
          error: "Conflict",
          message: `Case ${id} is not unassignable`,
          status: 409,
        });
      }

      // Await only the atomic retry acceptance. Assignment resumes
      // asynchronously after the command and state transition commit.
      await orchestrator.retryUnassignable(id, body.commandId);
      return reply.code(202).send({ accepted: true });
    },
  );
};
