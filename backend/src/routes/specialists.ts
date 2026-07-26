/** Specialist listing and availability updates. */
import type { FastifyPluginAsync } from "fastify";
import { specialistRepository } from "../db/repositories/specialistRepository.js";
import {
  launchBackgroundTask,
  type Orchestrator,
} from "../pipeline/index.js";
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

      const result = await specialistRepository.updateAvailabilityWithCommand({
        commandId: body.commandId,
        specialistId: id,
        onPto: body.onPto,
      });

      if (result.becameUnavailable) {
        launchBackgroundTask(
          orchestrator.reassignForSpecialist(id),
          { operation: "REASSIGN_FOR_SPECIALIST", specialistId: id },
          (error, context) => {
            req.log.error(
              { err: error, ...context },
              "background pipeline task failed",
            );
          },
        );
      }

      return {
        ...result.specialist,
        currentLoad: await specialistRepository.getDerivedLoad(id),
      };
    },
  );
};
