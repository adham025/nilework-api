import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  GigCreateSchema,
  GigListItemSchema,
  GigListQuerySchema,
  GigListResponseSchema,
  GigSchema,
  GigStatusUpdateSchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createGig, getGigBySlug, listGigs, listMyGigs, updateGigStatus } from "./gigs.service";

export async function gigRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Public browse.
  r.get(
    "/gigs",
    {
      schema: {
        tags: ["marketplace"],
        summary: "Browse active gigs (cursor-paginated, optional category)",
        querystring: GigListQuerySchema,
        response: { 200: GigListResponseSchema },
      },
    },
    async (req) => listGigs(req.query),
  );

  // Public gig detail by slug.
  r.get(
    "/gigs/:slug",
    {
      schema: {
        tags: ["marketplace"],
        summary: "Get an active gig by slug",
        params: z.object({ slug: z.string() }),
        response: { 200: GigListItemSchema, 404: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      const gig = await getGigBySlug(req.params.slug);
      if (!gig) {
        return reply.code(404).send({ error: { code: "not_found", message: "Gig not found" } });
      }
      return gig;
    },
  );

  // Create a gig (authenticated freelancer).
  r.post(
    "/gigs",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["marketplace"],
        summary: "Create a gig",
        body: GigCreateSchema,
        response: { 201: GigSchema, 401: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const gig = await createGig(req.authUser!.id, req.body);
      return reply.code(201).send(gig);
    },
  );

  // The caller's own gigs (including drafts/paused).
  r.get(
    "/me/gigs",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["marketplace"],
        summary: "List the caller's own gigs",
        response: { 200: z.array(GigSchema), 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listMyGigs(req.authUser!.id),
  );

  // Change a gig's status (own gig only).
  r.patch(
    "/gigs/:id/status",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["marketplace"],
        summary: "Update a gig's status (owner only)",
        params: z.object({ id: z.string().uuid() }),
        body: GigStatusUpdateSchema,
        response: { 200: GigSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      const gig = await updateGigStatus(
        req.params.id,
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        req.authUser!.id,
        req.body.status,
      );
      if (!gig) {
        return reply.code(404).send({ error: { code: "not_found", message: "Gig not found" } });
      }
      return gig;
    },
  );
}
