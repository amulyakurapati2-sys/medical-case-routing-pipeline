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
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createLlmClient } from "./llm/index.js";
import { createOrchestrator } from "./pipeline/index.js";
import { bus } from "./events/bus.js";
import { casesRoutes } from "./routes/cases.js";
import { specialistsRoutes } from "./routes/specialists.js";
import { streamRoutes } from "./routes/stream.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "*.LLM_API_KEY", "*.DATABASE_URL"],
    },
    // Reject oversized JSON bodies (HTTP 413).
    bodyLimit: config.BODY_LIMIT_BYTES,
    // Render forwards the original client address. Trust it in production so
    // per-IP abuse controls do not group every visitor under the proxy address.
    trustProxy: config.NODE_ENV === "production" ? 1 : false,
  });

  // Standard security response headers.
  await app.register(helmet);

  // Allow browser calls only from the configured frontend origin.
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ["GET", "POST", "PATCH"],
  });

  // Public demo routes opt into limits individually. Read-only endpoints and
  // long-lived SSE connections remain unrestricted by this in-memory limiter.
  await app.register(rateLimit, {
    global: false,
    hook: "preHandler",
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

  // Construct the AI seam once and wire the pipeline into the HTTP surface.
  const llm = createLlmClient(config);
  const orchestrator = createOrchestrator({
    llm,
    onBackgroundError: (error, context) => {
      app.log.error(
        { err: error, ...context },
        "background pipeline task failed",
      );
    },
  });

  await app.register(casesRoutes, { prefix: "/api", orchestrator });
  await app.register(specialistsRoutes, { prefix: "/api", orchestrator });
  await app.register(streamRoutes, { prefix: "/api", bus });

  // Production uses one public origin for the Vue app, REST API, and SSE stream.
  // The Render build creates frontend/dist before starting this service.
  if (config.NODE_ENV === "production") {
    const here = dirname(fileURLToPath(import.meta.url));
    await app.register(fastifyStatic, {
      root: resolve(here, "../../frontend/dist"),
    });
  }

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
