/**
 * Lookup and recording of processed command IDs (idempotent review / PTO updates).
 * New commands are usually written inside the same transaction as appendEventAndProject.
 */
import type { ProcessedCommand, Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../prisma.js";

export const commandRepository = {
  async findByCommandId(commandId: string): Promise<ProcessedCommand | null> {
    return prisma.processedCommand.findUnique({ where: { commandId } });
  },

  async record(input: {
    commandId: string;
    kind: string;
    resourceType: string;
    resourceId: string;
    resultSummary?: Prisma.InputJsonValue;
  }): Promise<ProcessedCommand> {
    return prisma.processedCommand.create({
      data: {
        commandId: input.commandId,
        kind: input.kind,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        resultSummary: input.resultSummary ?? undefined,
      },
    });
  },
};
