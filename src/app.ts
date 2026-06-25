import { corsOrigins, isProd } from "@/core/env";
import { categoryRoutes } from "@/modules/categories/categories.routes";
import { gigRoutes } from "@/modules/gigs/gigs.routes";
import { healthRoutes } from "@/modules/health/health.routes";
import { profileRoutes } from "@/modules/profiles/profiles.routes";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

/**
 * Builds the Fastify app (separated from server start so tests can boot it
 * in-process). All routes are versioned under /v1 (MASTER_PLAN §6.10).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: "pino-pretty" }, level: "info" },
    disableRequestLogging: false,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod is the single validation + serialization layer (MASTER_PLAN §6.4).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: corsOrigins, credentials: true });

  // OpenAPI spec generated from the same Zod schemas (MASTER_PLAN §6.1).
  await app.register(swagger, {
    openapi: {
      info: { title: "Nilework API", version: "0.1.0" },
      servers: [{ url: "/" }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  // Versioned API surface.
  await app.register(healthRoutes, { prefix: "/v1" });
  await app.register(profileRoutes, { prefix: "/v1" });
  await app.register(categoryRoutes, { prefix: "/v1" });
  await app.register(gigRoutes, { prefix: "/v1" });

  return app;
}
