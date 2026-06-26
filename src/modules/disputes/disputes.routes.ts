import { requireAuth, requireStaff } from "@/core/auth";
import {
  ApiErrorSchema,
  DisputeListSchema,
  DisputeOpenSchema,
  DisputeResolveSchema,
  DisputeSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  DisputeError,
  getDisputeForOrder,
  listOpenDisputes,
  openDispute,
  resolveDispute,
} from "./disputes.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DisputeError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const IdParam = z.object({ id: z.string().uuid() });

export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/orders/:id/dispute",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disputes"],
        summary: "Open a dispute on an order (party only)",
        params: IdParam,
        body: DisputeOpenSchema,
        response: {
          201: DisputeSchema,
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
      const d = await run(reply, () => openDispute(req.params.id, userId, req.body.reason));
      if (d) return reply.code(201).send(d);
    },
  );

  r.get(
    "/orders/:id/dispute",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disputes"],
        summary: "Get an order's dispute (party only)",
        params: IdParam,
        response: {
          200: DisputeSchema.nullable(),
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => getDisputeForOrder(req.params.id, req.authUser!.id)),
  );

  // --- staff ---------------------------------------------------------------

  r.get(
    "/admin/disputes",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "List open disputes (staff)",
        response: { 200: DisputeListSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async () => listOpenDisputes(),
  );

  r.post(
    "/admin/disputes/:id/resolve",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Resolve a dispute — release or refund (staff)",
        params: IdParam,
        body: DisputeResolveSchema,
        response: {
          200: DisputeSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireStaff guarantees staffUser.
      const staffId = req.staffUser!.id;
      return run(reply, () =>
        resolveDispute(req.params.id, staffId, req.body.resolution, req.body.note),
      );
    },
  );
}
