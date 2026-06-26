import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  SavedSearchCreateSchema,
  SavedSearchListSchema,
  SavedSearchSchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSavedSearch, deleteSavedSearch, listSavedSearches } from "./saved-searches.service";

export async function savedSearchRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/saved-searches",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["discovery"],
        summary: "List the caller's saved searches",
        response: { 200: SavedSearchListSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listSavedSearches(req.authUser!.id),
  );

  r.post(
    "/me/saved-searches",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["discovery"],
        summary: "Save the current browse filters",
        body: SavedSearchCreateSchema,
        response: { 201: SavedSearchSchema, 401: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const saved = await createSavedSearch(req.authUser!.id, req.body.label, req.body.query);
      return reply.code(201).send(saved);
    },
  );

  r.delete(
    "/me/saved-searches/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["discovery"],
        summary: "Delete a saved search",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ ok: z.boolean() }), 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      await deleteSavedSearch(req.authUser!.id, req.params.id);
      return { ok: true };
    },
  );
}
