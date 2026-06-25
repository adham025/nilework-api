import "dotenv/config";
import { z } from "zod";

/**
 * Environment validation — fail fast at boot if config is wrong (MASTER_PLAN §6.10).
 * Secrets live only in .env (gitignored) / the host's secret store, never in the repo.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),

  // Supabase — data layer + identity provider (MASTER_PLAN §6).
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Direct Postgres connection (service-role path for business logic / ledger).
  // Optional at boot so the server still starts before the DB string is finalized;
  // the health check reports "unconfigured" rather than crashing.
  DATABASE_URL: z.string().url().optional(),

  // Observability.
  SENTRY_DSN: z.string().url().optional(),

  // Email (Resend) — used by the notification worker (MASTER_PLAN §6.11).
  RESEND_API_KEY: z.string().optional(),

  // CORS: comma-separated allowed origins for the web app.
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const corsOrigins = env.CORS_ORIGINS.split(",").map((o) => o.trim());
