import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  ProfileReviewsResponseSchema,
  ReviewCreateSchema,
  ReviewListSchema,
  ReviewSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ReviewError, createReview, getProfileReviews, listOrderReviews } from "./reviews.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ReviewError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const IdParam = z.object({ id: z.string().uuid() });

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/orders/:id/review",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["reviews"],
        summary: "Leave a review on a completed order (party only)",
        params: IdParam,
        body: ReviewCreateSchema,
        response: {
          201: ReviewSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const review = await run(reply, () =>
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        createReview(req.params.id, req.authUser!.id, req.body),
      );
      if (review) return reply.code(201).send(review);
    },
  );

  r.get(
    "/orders/:id/reviews",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["reviews"],
        summary: "List reviews on an order (party only)",
        params: IdParam,
        response: {
          200: ReviewListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => listOrderReviews(req.params.id, req.authUser!.id)),
  );

  // Public reputation — the trust graph headline shown on profiles/gigs (§3).
  r.get(
    "/profiles/:id/reviews",
    {
      schema: {
        tags: ["reviews"],
        summary: "Public reviews + aggregate rating for a profile",
        params: IdParam,
        response: { 200: ProfileReviewsResponseSchema },
      },
    },
    async (req) => getProfileReviews(req.params.id),
  );
}
