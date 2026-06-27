import { requireAuth } from "@/core/auth";
import { ApiErrorSchema, PlanBadgeSchema, SubscriptionSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { activatePro, getMySubscription, isPro } from "./plans.service";

export async function planRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/subscription",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["plans"],
        summary: "The caller's subscription (or null)",
        response: { 200: SubscriptionSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => getMySubscription(req.authUser!.id),
  );

  r.post(
    "/me/subscription/activate",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["plans"],
        summary: "Activate/extend Pro for 30 days (dev; prod via payment webhook)",
        response: { 200: SubscriptionSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => activatePro(req.authUser!.id),
  );

  r.get(
    "/profiles/:id/plan",
    {
      schema: {
        tags: ["plans"],
        summary: "Public Pro flag for a profile (badge)",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: PlanBadgeSchema },
      },
    },
    async (req) => ({ pro: await isPro(req.params.id) }),
  );
}
