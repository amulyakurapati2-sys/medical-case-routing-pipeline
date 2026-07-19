/** Lookup processed command IDs used by resumable pipeline actions. */
import type { ProcessedCommand } from "../../generated/prisma/index.js";
import { prisma } from "../prisma.js";

export const commandRepository = {
  async findByCommandId(commandId: string): Promise<ProcessedCommand | null> {
    return prisma.processedCommand.findUnique({ where: { commandId } });
  },
};
