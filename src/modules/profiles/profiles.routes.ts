import { requireAuth } from "@/core/auth";
import { ApiErrorSchema, ProfileSchema, ProfileUpdateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ensureProfile, updateProfile } from "./profiles.service";

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
      return updateProfile(req.authUser!.id, req.body);
    },
  );
}
