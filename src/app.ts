import { corsOrigins, isProd } from "@/core/env";
import { adminRoutes } from "@/modules/admin/admin.routes";
import { categoryRoutes } from "@/modules/categories/categories.routes";
import { configRoutes } from "@/modules/config/config.routes";
import { conversationRoutes } from "@/modules/conversations/conversations.routes";
import { disputeRoutes } from "@/modules/disputes/disputes.routes";
import { favoriteRoutes } from "@/modules/favorites/favorites.routes";
import { fxRoutes } from "@/modules/fx/fx.routes";
import { gamificationRoutes } from "@/modules/gamification/gamification.routes";
import { gigRoutes } from "@/modules/gigs/gigs.routes";
import { healthRoutes } from "@/modules/health/health.routes";
import { identityRoutes } from "@/modules/identity/identity.routes";
import { levelRoutes } from "@/modules/levels/levels.routes";
import { milestoneRoutes } from "@/modules/milestones/milestones.routes";
import { notificationRoutes } from "@/modules/notifications/notifications.routes";
import { offerRoutes } from "@/modules/offers/offers.routes";
import { orderRoutes } from "@/modules/orders/orders.routes";
import { paymentRoutes } from "@/modules/payments/payments.routes";
import { payoutRoutes } from "@/modules/payouts/payouts.routes";
import { profileRoutes } from "@/modules/profiles/profiles.routes";
import { promoRoutes } from "@/modules/promo/promo.routes";
import { redemptionRoutes } from "@/modules/redemptions/redemptions.routes";
import { reviewRoutes } from "@/modules/reviews/reviews.routes";
import { skillRoutes } from "@/modules/skills/skills.routes";
import { walletRoutes } from "@/modules/wallet/wallet.routes";
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
  await app.register(orderRoutes, { prefix: "/v1" });
  await app.register(milestoneRoutes, { prefix: "/v1" });
  await app.register(offerRoutes, { prefix: "/v1" });
  await app.register(paymentRoutes, { prefix: "/v1" });
  await app.register(payoutRoutes, { prefix: "/v1" });
  await app.register(conversationRoutes, { prefix: "/v1" });
  await app.register(reviewRoutes, { prefix: "/v1" });
  await app.register(levelRoutes, { prefix: "/v1" });
  await app.register(skillRoutes, { prefix: "/v1" });
  await app.register(notificationRoutes, { prefix: "/v1" });
  await app.register(gamificationRoutes, { prefix: "/v1" });
  await app.register(redemptionRoutes, { prefix: "/v1" });
  await app.register(promoRoutes, { prefix: "/v1" });
  await app.register(identityRoutes, { prefix: "/v1" });
  await app.register(disputeRoutes, { prefix: "/v1" });
  await app.register(favoriteRoutes, { prefix: "/v1" });
  await app.register(adminRoutes, { prefix: "/v1" });
  await app.register(walletRoutes, { prefix: "/v1" });
  await app.register(fxRoutes, { prefix: "/v1" });
  await app.register(configRoutes, { prefix: "/v1" });

  return app;
}
