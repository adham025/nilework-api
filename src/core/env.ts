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

  // Email (Resend) — money/deadline notifications (MASTER_PLAN §6.11). When the
  // key is unset, email is skipped (in-app notifications still work).
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("Nilework <noreply@nilework.com>"),

  // Paymob (Egypt payments, MASTER_PLAN §6). All optional: when unset, order
  // checkout runs in dev "simulation" mode and funds escrow directly, so the loop
  // is testable locally without gateway keys. Production sets all four.
  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_INTEGRATION_ID: z.coerce.number().int().positive().optional(),
  PAYMOB_IFRAME_ID: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),

  // Phone OTP CPaaS (WhatsApp-first, SMS fallback — MASTER_PLAN §6). When unset,
  // OTP runs in "log" mode (code printed to the server log) so the flow is testable
  // locally without a provider/registered sender.
  OTP_PROVIDER: z.enum(["cequens", "log"]).default("log"),
  CEQUENS_API_KEY: z.string().optional(),
  CEQUENS_SENDER: z.string().optional(),

  // Live FX feed (MASTER_PLAN §6: replace the placeholder rate). Optional API key
  // for the rate source consumed by the worker's scheduled refresh.
  FX_API_URL: z.string().url().optional(),
  FX_API_KEY: z.string().optional(),

  // Public base URL of the web app, for building post-payment redirect targets.
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),

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

/** True only when every Paymob credential is present — gates the real gateway path. */
export const isPaymobConfigured = Boolean(
  env.PAYMOB_API_KEY && env.PAYMOB_INTEGRATION_ID && env.PAYMOB_IFRAME_ID && env.PAYMOB_HMAC_SECRET,
);
