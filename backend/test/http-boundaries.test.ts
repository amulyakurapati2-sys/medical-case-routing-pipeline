import assert from "node:assert/strict";
import test from "node:test";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  CreateCaseBody,
  PtoBody,
  ReviewBody,
} from "../src/routes/schemas.js";

test("case input accepts the documented maximum length", () => {
  const result = CreateCaseBody.safeParse({ text: "x".repeat(4_000) });

  assert.equal(result.success, true);
});

test("case input rejects prompts above the documented maximum length", () => {
  const result = CreateCaseBody.safeParse({ text: "x".repeat(4_001) });

  assert.equal(result.success, false);
});

test("review override requires a category", () => {
  const result = ReviewBody.safeParse({
    commandId: crypto.randomUUID(),
    action: "OVERRIDE",
  });

  assert.equal(result.success, false);
});

test("state-changing commands require UUID idempotency keys", () => {
  const result = PtoBody.safeParse({
    commandId: "not-a-uuid",
    onPto: true,
  });

  assert.equal(result.success, false);
});

test("rate-limited routes return 429 after the per-IP quota", async (t) => {
  const app = Fastify();
  await app.register(rateLimit, { global: false });
  app.post(
    "/limited",
    { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } },
    async () => ({ ok: true }),
  );
  await app.ready();
  t.after(() => app.close());

  const request = () =>
    app.inject({
      method: "POST",
      url: "/limited",
      remoteAddress: "203.0.113.10",
    });

  assert.equal((await request()).statusCode, 200);
  assert.equal((await request()).statusCode, 200);
  assert.equal((await request()).statusCode, 429);
});
