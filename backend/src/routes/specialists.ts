/** Specialist listing and availability updates. */
import type { FastifyPluginAsync } from "fastify";
import { commandRepository } from "../db/repositories/commandRepository.js";
import { specialistRepository } from "../db/repositories/specialistRepository.js";
import type { Orchestrator } from "../pipeline/index.js";
import { PtoBody, parseBody } from "./schemas.js";

type SpecialistsDeps = { orchestrator: Orchestrator };

export const specialistsRoutes: FastifyPluginAsync<SpecialistsDeps> = async (
  app,
  opts,
) => {
  const { orchestrator } = opts;

  app.get("/specialists", async () => {
    const list = await specialistRepository.findAll();
    return Promise.all(
      list.map(async (s) => ({
        ...s,
        currentLoad: await specialistRepository.getDerivedLoad(s.id),
      })),
    );
  });

  app.patch(
    "/specialists/:id",
    { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = parseBody(PtoBody, req.body);

      const existing = await specialistRepository.findById(id);
      if (!existing) {
        return reply.code(404).send({
          error: "Not Found",
          message: `Specialist ${id} not found`,
          status: 404,
        });
      }

      // Idempotency: a replayed command returns current state without re-triggering.
      const alreadyProcessed = await commandRepository.findByCommandId(body.commandId);
      if (alreadyProcessed) {
        return specialistRepository.findById(id);
      }

      const updated = await specialistRepository.updateAvailability(id, body.onPto);
      await commandRepository.record({
        commandId: body.commandId,
        kind: "PTO",
        resourceType: "specialist",
        resourceId: id,
      });

      if (body.onPto) {
        void orchestrator.reassignForSpecialist(id);
      }

      return updated;
    },
  );
};
