import { requireAuth, requireStaff } from "@/core/auth";
import {
  ApiErrorSchema,
  PaginationQuerySchema,
  PayoutCreateSchema,
  PayoutListResponseSchema,
  PayoutMarkFailedSchema,
  PayoutMarkPaidSchema,
  PayoutSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PayoutError,
  cancelPayout,
  listMyPayouts,
  listPendingPayouts,
  markPayoutFailed,
  markPayoutPaid,
  markPayoutProcessing,
  requestPayout,
} from "./payouts.service";

const STATUS_BY_CODE = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  unprocessable: 422,
} as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PayoutError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const IdParam = z.object({ id: z.string().uuid() });

export async function payoutRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // --- freelancer ----------------------------------------------------------

  r.post(
    "/me/payouts",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["payouts"],
        summary: "Request a withdrawal of available balance",
        body: PayoutCreateSchema,
        response: {
          200: PayoutSchema,
          401: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => requestPayout(req.authUser!.id, req.body)),
  );

  r.get(
    "/me/payouts",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["payouts"],
        summary: "List the caller's payouts (cursor-paginated)",
        querystring: PaginationQuerySchema,
        response: { 200: PayoutListResponseSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listMyPayouts(req.authUser!.id, req.query),
  );

  r.post(
    "/me/payouts/:id/cancel",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["payouts"],
        summary: "Cancel a still-pending payout (funds return to balance)",
        params: IdParam,
        response: {
          200: PayoutSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => cancelPayout(req.params.id, req.authUser!.id)),
  );

  // --- staff / ops (§6.2) --------------------------------------------------

  r.get(
    "/admin/payouts",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "List pending payouts awaiting disbursement (staff)",
        querystring: PaginationQuerySchema,
        response: { 200: PayoutListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async (req) => listPendingPayouts(req.query),
  );

  r.post(
    "/admin/payouts/:id/process",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Mark a payout as processing (staff)",
        params: IdParam,
        response: {
          200: PayoutSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => run(reply, () => markPayoutProcessing(req.params.id)),
  );

  r.post(
    "/admin/payouts/:id/paid",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Mark a payout paid with a disbursement reference (staff)",
        params: IdParam,
        body: PayoutMarkPaidSchema,
        response: {
          200: PayoutSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => run(reply, () => markPayoutPaid(req.params.id, req.body.provider_ref)),
  );

  r.post(
    "/admin/payouts/:id/failed",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Mark a payout failed; funds return to the wallet (staff)",
        params: IdParam,
        body: PayoutMarkFailedSchema,
        response: {
          200: PayoutSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => run(reply, () => markPayoutFailed(req.params.id, req.body.note)),
  );
}
