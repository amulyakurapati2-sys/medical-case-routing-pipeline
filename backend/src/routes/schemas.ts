/** Request-body schemas shared by the HTTP routes. */
import { z } from "zod";
import { Department, Priority } from "../generated/prisma/index.js";

export const CreateCaseBody = z.object({
  // Enough room for a useful synthetic case without allowing an anonymous
  // visitor to send an excessive prompt to the configured LLM provider.
  text: z
    .string()
    .trim()
    .min(1, "text is required")
    .max(4_000, "text must be 4000 characters or fewer"),
});
export type CreateCaseBody = z.infer<typeof CreateCaseBody>;

export const ReviewBody = z.discriminatedUnion("action", [
  z
    .object({
      commandId: z.uuid("commandId must be a UUID"),
      action: z.literal("APPROVE"),
    })
    .strict(),
  z
    .object({
      commandId: z.uuid("commandId must be a UUID"),
      action: z.literal("OVERRIDE"),
      overrideCategory: z.nativeEnum(Department),
      overridePriority: z.nativeEnum(Priority).optional(),
    })
    .strict(),
  z
    .object({
      commandId: z.uuid("commandId must be a UUID"),
      action: z.literal("REJECT"),
    })
    .strict(),
]);
export type ReviewBody = z.infer<typeof ReviewBody>;

export const RetryCaseBody = z.object({
  commandId: z.uuid("commandId must be a UUID"),
});
export type RetryCaseBody = z.infer<typeof RetryCaseBody>;

export const PtoBody = z.object({
  commandId: z.uuid("commandId must be a UUID"),
  onPto: z.boolean(),
});
export type PtoBody = z.infer<typeof PtoBody>;

/** Parse a request body; on failure throw an Error tagged with `statusCode = 400`. */
export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return result.data;
}
