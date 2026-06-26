import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  OfferCreateSchema,
  OfferListSchema,
  OfferSchema,
  OrderDetailSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  OfferError,
  acceptOffer,
  createOffer,
  declineOffer,
  listOffers,
  withdrawOffer,
} from "./offers.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof OfferError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const IdParam = z.object({ id: z.string().uuid() });

export async function offerRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/conversations/:id/offers",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["offers"],
        summary: "Send a custom offer in a conversation (freelancer)",
        params: IdParam,
        body: OfferCreateSchema,
        response: {
          201: OfferSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const offer = await run(reply, () =>
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        createOffer(req.params.id, req.authUser!.id, req.body),
      );
      if (offer) return reply.code(201).send(offer);
    },
  );

  r.get(
    "/conversations/:id/offers",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["offers"],
        summary: "List a conversation's offers (participant only)",
        params: IdParam,
        response: { 200: OfferListSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listOffers(req.params.id, req.authUser!.id),
  );

  r.post(
    "/offers/:id/accept",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["offers"],
        summary: "Accept an offer into an order (client)",
        params: IdParam,
        response: {
          200: OrderDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => acceptOffer(req.params.id, req.authUser!.id)),
  );

  r.post(
    "/offers/:id/decline",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["offers"],
        summary: "Decline a pending offer (client)",
        params: IdParam,
        response: {
          200: OfferSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => declineOffer(req.params.id, req.authUser!.id)),
  );

  r.post(
    "/offers/:id/withdraw",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["offers"],
        summary: "Withdraw a pending offer (freelancer)",
        params: IdParam,
        response: {
          200: OfferSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => withdrawOffer(req.params.id, req.authUser!.id)),
  );
}
