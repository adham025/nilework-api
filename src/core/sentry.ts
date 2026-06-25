import * as Sentry from "@sentry/node";
import { env, isProd } from "./env";

/** Initialise Sentry error tracking (MASTER_PLAN §6 observability). No-op if DSN is unset. */
export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    enabled: isProd,
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
