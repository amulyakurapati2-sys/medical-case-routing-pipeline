/**
 * U6 — zod request-body schemas + a small validation helper.
 * Invalid bodies throw a 400-tagged error the global handler turns into a safe envelope.
 */
import { z } from "zod";
import { Department, Priority, ReviewDecision } from "../types.js";

export const CreateCaseBody = z.object({
  text: z.string().min(1, "text is required"),
});
export type CreateCaseBody = z.infer<typeof CreateCaseBody>;

export const ReviewBody = z.object({
  commandId: z.string().min(1, "commandId is required"),
  action: z.nativeEnum(ReviewDecision),
  overrideCategory: z.nativeEnum(Department).optional(),
  overridePriority: z.nativeEnum(Priority).optional(),
});
export type ReviewBody = z.infer<typeof ReviewBody>;

export const PtoBody = z.object({
  commandId: z.string().min(1, "commandId is required"),
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
