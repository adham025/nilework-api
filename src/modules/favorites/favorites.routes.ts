import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  FavoriteCreateSchema,
  FavoriteListSchema,
  FavoriteStatusSchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { addFavorite, isFavorited, listFavorites, removeFavorite } from "./favorites.service";

export async function favoriteRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/favorites",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["favorites"],
        summary: "List the caller's saved gigs",
        response: { 200: FavoriteListSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listFavorites(req.authUser!.id),
  );

  r.post(
    "/me/favorites",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["favorites"],
        summary: "Save a gig",
        body: FavoriteCreateSchema,
        response: { 200: FavoriteStatusSchema, 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      await addFavorite(req.authUser!.id, req.body.gig_id);
      return { favorited: true };
    },
  );

  r.delete(
    "/me/favorites/:gigId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["favorites"],
        summary: "Unsave a gig",
        params: z.object({ gigId: z.string().uuid() }),
        response: { 200: FavoriteStatusSchema, 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      await removeFavorite(req.authUser!.id, req.params.gigId);
      return { favorited: false };
    },
  );

  r.get(
    "/me/favorites/:gigId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["favorites"],
        summary: "Whether a gig is saved by the caller",
        params: z.object({ gigId: z.string().uuid() }),
        response: { 200: FavoriteStatusSchema, 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const favorited = await isFavorited(req.authUser!.id, req.params.gigId);
      return { favorited };
    },
  );
}
