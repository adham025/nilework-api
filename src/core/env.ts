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

  // Which gateway to use. "auto" prefers Paymob, then Kashier, else dev simulation.
  // "simulated" forces dev simulation (funds escrow directly) even when a gateway is
  // configured — handy for testing the full order loop locally without a webhook.
  PAYMENT_PROVIDER: z.enum(["auto", "paymob", "kashier", "simulated"]).default("auto"),

  // Public URL of THIS API, used to build absolute provider webhook URLs (e.g.
  // Kashier serverWebhook). Optional; gateways can use a dashboard webhook instead.
  API_BASE_URL: z.string().url().optional(),

  // Paymob (Egypt payments, MASTER_PLAN §6). All optional: when unset, order
  // checkout runs in dev "simulation" mode and funds escrow directly, so the loop
  // is testable locally without gateway keys. Production sets all four.
  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_INTEGRATION_ID: z.coerce.number().int().positive().optional(),
  PAYMOB_IFRAME_ID: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),

  // Kashier (Egypt payments) — alternative to Paymob. KASHIER_API_KEY signs the
  // hosted-page order hash; KASHIER_SECRET_KEY signs webhooks (falls back to the
  // API key if unset). Unset = adapter inactive.
  KASHIER_MERCHANT_ID: z.string().optional(),
  KASHIER_API_KEY: z.string().optional(),
  KASHIER_SECRET_KEY: z.string().optional(),
  KASHIER_MODE: z.enum(["test", "live"]).default("test"),

  // Phone OTP CPaaS (WhatsApp-first, SMS fallback — MASTER_PLAN §6). When unset,
  // OTP runs in "log" mode (code printed to the server log) so the flow is testable
  // locally without a provider/registered sender.
  OTP_PROVIDER: z.enum(["cequens", "log"]).default("log"),
  CEQUENS_API_KEY: z.string().optional(),
  CEQUENS_SENDER: z.string().optional(),

  // Live FX feed (MASTER_PLAN §6: replace the placeholder rate). Optional API key
  // for the rate source consumed by the worker's scheduled refresh.
  // Keyed hash for national-ID duplicate lookup (identity Req 8). Falls back to
  // the service-role key so dev works without extra config; set explicitly in prod.
  ID_HASH_KEY: z.string().optional(),
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

/** True when the minimum Kashier credentials are present. */
export const isKashierConfigured = Boolean(env.KASHIER_MERCHANT_ID && env.KASHIER_API_KEY);

/**
 * Resolve which gateway checkout should use. Honours an explicit PAYMENT_PROVIDER
 * (falling back to simulation if that provider isn't configured); otherwise prefers
 * Paymob, then Kashier, then dev simulation.
 */
export function activePaymentProvider(): "paymob" | "kashier" | "simulated" {
  if (env.PAYMENT_PROVIDER === "simulated") return "simulated";
  if (env.PAYMENT_PROVIDER === "paymob") return isPaymobConfigured ? "paymob" : "simulated";
  if (env.PAYMENT_PROVIDER === "kashier") return isKashierConfigured ? "kashier" : "simulated";
  if (isPaymobConfigured) return "paymob";
  if (isKashierConfigured) return "kashier";
  return "simulated";
}
