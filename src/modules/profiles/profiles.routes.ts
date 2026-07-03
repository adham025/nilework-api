import { requireAuth } from "@/core/auth";
import { awardAchievement } from "@/modules/gamification/gamification.service";
import {
  ApiErrorSchema,
  FreelancerListQuerySchema,
  FreelancerListResponseSchema,
  ProfileSchema,
  ProfileUpdateSchema,
  PublicFreelancerSchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ensureProfile,
  getPublicFreelancer,
  listFreelancers,
  updateProfile,
} from "./profiles.service";

/** Authenticated profile endpoints — the "me" surface for onboarding + edits. */
export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["profiles"],
        summary: "Get (or lazily create) the authenticated user's profile",
        response: { 200: ProfileSchema, 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      return ensureProfile(req.authUser!.id);
    },
  );

  r.patch(
    "/me",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["profiles"],
        summary: "Update the authenticated user's profile (onboarding + edits)",
        body: ProfileUpdateSchema,
        response: { 200: ProfileSchema, 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const profile = await updateProfile(req.authUser!.id, req.body);
      // Gamification Phase-1 hook (§5.3): badge once onboarding completes.
      if (profile.onboarding_completed) await awardAchievement(profile.id, "profile_complete");
      return profile;
    },
  );
}

/** Public freelancer discovery — browse + profile (public-browse-search-phase1). */
export async function freelancerRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/freelancers",
    {
      schema: {
        tags: ["marketplace"],
        summary: "Browse freelancers (public; keyword + verified filter, cursor-paginated)",
        querystring: FreelancerListQuerySchema,
        response: { 200: FreelancerListResponseSchema },
      },
    },
    async (req) => listFreelancers(req.query),
  );

  r.get(
    "/freelancers/:id",
    {
      schema: {
        tags: ["marketplace"],
        summary: "Public freelancer profile",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: PublicFreelancerSchema, 404: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      const profile = await getPublicFreelancer(req.params.id);
      if (!profile) {
        return reply
          .code(404)
          .send({ error: { code: "not_found", message: "Freelancer not found" } });
      }
      return profile;
    },
  );
}
