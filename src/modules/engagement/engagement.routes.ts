import { requireAuth } from "@/core/auth";
import { ApiErrorSchema, LeaderboardSchema, StreakSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getLeaderboard, getMyStreak, recordActivity } from "./engagement.service";

export async function engagementRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/leaderboard",
    {
      schema: {
        tags: ["engagement"],
        summary: "Top earners by points over the last 30 days",
        response: { 200: LeaderboardSchema },
      },
    },
    async () => getLeaderboard(),
  );

  r.get(
    "/me/streak",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["engagement"],
        summary: "The caller's activity streak",
        response: { 200: StreakSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => getMyStreak(req.authUser!.id),
  );

  r.post(
    "/me/streak/ping",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["engagement"],
        summary: "Record a day of activity (daily heartbeat)",
        response: { 200: StreakSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => recordActivity(req.authUser!.id),
  );
}
