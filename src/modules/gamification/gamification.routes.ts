import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  ApplyResultSchema,
  ReferralApplySchema,
  RewardsSummarySchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { applyReferral, getRewards } from "./gamification.service";

export async function gamificationRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/rewards",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gamification"],
        summary: "Points balance, earned badges, and referral code for the caller",
        response: { 200: RewardsSummarySchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => getRewards(req.authUser!.id),
  );

  r.post(
    "/me/referral",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gamification"],
        summary: "Apply a referral code (before the first completed order)",
        body: ReferralApplySchema,
        response: { 200: ApplyResultSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => applyReferral(req.authUser!.id, req.body.code),
  );
}
