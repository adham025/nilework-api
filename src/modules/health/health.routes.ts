import { checkDbHealth } from "@/core/db";
import { HealthResponseSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const VERSION = "0.1.0";

/** Liveness/readiness endpoint — also the first real Zod-validated, OpenAPI-documented route. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Service health and dependency checks",
        response: { 200: HealthResponseSchema },
      },
    },
    async () => {
      const database = await checkDbHealth();
      return {
        status: "ok" as const,
        service: "nilework-api" as const,
        version: VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        checks: { database },
        timestamp: new Date().toISOString(),
      };
    },
  );
}
