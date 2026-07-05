import { requireAuth } from "@/core/auth";
import { runDomain } from "@/core/errors";
import {
  ApiErrorSchema,
  IdParamSchema as IdParam,
  OrderCreateSchema,
  OrderDetailSchema,
  OrderListQuerySchema,
  OrderListResponseSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  cancelOrder,
  createOrder,
  getOrder,
  listMyOrders,
  markDelivered,
  releaseEscrow,
} from "./orders.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;

/** Run an order action, translating OrderError into the right HTTP response. */
function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  return runDomain(reply, STATUS_BY_CODE, fn);
}

/** Order + escrow state-machine endpoints (§6). All party-scoped + authenticated. */
export async function orderRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/orders",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["orders"],
        summary: "Create an order by purchasing a gig (client)",
        body: OrderCreateSchema,
        response: {
          201: OrderDetailSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      const order = await run(reply, () =>
        createOrder(userId, req.body.gig_id, req.body.promo_code),
      );
      if (order) return reply.code(201).send(order);
    },
  );

  r.get(
    "/me/orders",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["orders"],
        summary: "List the caller's orders (as client and/or freelancer)",
        querystring: OrderListQuerySchema,
        response: { 200: OrderListResponseSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listMyOrders(req.authUser!.id, req.query),
  );

  r.get(
    "/orders/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["orders"],
        summary: "Get an order (client or freelancer party only)",
        params: IdParam,
        response: { 200: OrderDetailSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => getOrder(req.params.id, req.authUser!.id)),
  );

  r.post(
    "/orders/:id/deliver",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["orders"],
        summary: "Mark the order delivered (freelancer)",
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
    async (req, reply) => run(reply, () => markDelivered(req.params.id, req.authUser!.id)),
  );

  r.post(
    "/orders/:id/release",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["orders"],
        summary: "Release escrow to the freelancer (client)",
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
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => releaseEscrow(req.params.id, userId, "client"));
    },
  );

  r.post(
    "/orders/:id/cancel",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["orders"],
        summary: "Cancel an unfunded order (client)",
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
    async (req, reply) => run(reply, () => cancelOrder(req.params.id, req.authUser!.id)),
  );
}
