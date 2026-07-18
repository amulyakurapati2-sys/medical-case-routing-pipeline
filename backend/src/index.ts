/**
 * HTTP server entrypoint.
 *
 * Builds a Fastify app with security headers, request body size limits, CORS,
 * a safe error handler, liveness (`/health`), and database readiness (`/ready`).
 * Configuration is loaded and validated when `./config/env.js` is imported —
 * if env is invalid the process exits before listen.
 */
import Fastify, {
  type FastifyInstance,
  type FastifyError,
} from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { config } from "./config/env.js";
import { prisma } from "./db/prisma.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "*.LLM_API_KEY", "*.DATABASE_URL"],
    },
    // Reject oversized JSON bodies (HTTP 413).
    bodyLimit: config.BODY_LIMIT_BYTES,
  });

  // Standard security response headers.
  await app.register(helmet);

  // Allow browser calls only from the configured frontend origin.
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ["GET", "POST", "PATCH"],
  });

  // Clients get generic messages; full error detail stays in server logs.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    request.log.error({ err: error }, "request failed");

    if (status >= 500) {
      reply.status(500).send({ error: "Internal Server Error" });
      return;
    }
    reply.status(status).send({ error: error.message });
  });

  // Liveness probe — process is up (does not check the database).
  app.get("/health", async () => ({ status: "ok" }));

  // Readiness probe — verifies Postgres accepts a simple query.
  app.get("/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch (err) {
      app.log.warn({ err }, "readiness check failed");
      return reply.status(503).send({ status: "not_ready" });
    }
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
