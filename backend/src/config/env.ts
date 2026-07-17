/**
 * Application configuration loaded from environment variables.
 *
 * On startup we parse and validate env vars, apply defaults, freeze the result,
 * and export a single config object. If anything required is missing or invalid,
 * we log every problem (without printing secret values) and exit before the
 * HTTP server starts.
 */
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Load a `.env` file into `process.env` before validation.
 * Checks the repo root first, then `backend/`. Existing env vars are not overwritten.
 */
function loadEnvFile(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  // backend/src/config → backend → repo root
  const candidates = [
    resolve(here, "../../../.env"),
    resolve(here, "../../.env"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path });
      return;
    }
  }
}

loadEnvFile();

/** Accepts common boolean env strings: true/false/1/0. */
const booleanEnv = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const AppConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Keep secrets in `.env` only — never hardcode API keys in source.
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required"),

  // Default: Groq's OpenAI-compatible endpoint (swap via env for other providers).
  LLM_BASE_URL: z
    .string()
    .url()
    .default("https://api.groq.com/openai/v1"),

  LLM_MODEL: z.string().min(1).default("llama-3.3-70b-versatile"),

  LLM_JSON_MODE: booleanEnv.default(true),

  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),

  // Confidence scores are fractions in [0, 1], not percentages.
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),

  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),

  // Frontend origin allowed to call this API (dev Vite default).
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
});

/** Validated, immutable app settings used across the backend. */
export type AppConfig = Readonly<z.infer<typeof AppConfigSchema>>;

/**
 * Validate `process.env` against the schema.
 * On failure, print field names + reasons only (never secret values) and exit.
 */
function loadConfig(): AppConfig {
  const result = AppConfigSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const field = issue.path.join(".") || "(root)";
        return `  - ${field}: ${issue.message}`;
      })
      .join("\n");

    console.error(
      `\n[config] Invalid environment configuration. Fix the following and restart:\n${issues}\n`,
    );
    process.exit(1);
  }

  return Object.freeze(result.data);
}

/** Shared config instance — import this instead of reading `process.env` directly. */
export const config: AppConfig = loadConfig();
