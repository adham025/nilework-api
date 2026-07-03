import { requireAuth, requireStaff } from "@/core/auth";
import { auditLog } from "@/modules/admin/audit.service";
import {
  ApiErrorSchema,
  DisputeListSchema,
  DisputeMessageCreateSchema,
  DisputeMessageListSchema,
  DisputeMessageSchema,
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
  listDisputeMessages,
  listDisputeThreadStaff,
  listOpenDisputes,
  openDispute,
  postDisputeMessage,
  postStaffDisputeMessage,
  resolveDispute,
  signEvidenceUrl,
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

  // --- dispute thread (Phase 2: transparent dispute center) -----------------

  r.get(
    "/disputes/:id/messages",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disputes"],
        summary: "Dispute statement/evidence thread (parties only, oldest first)",
        params: IdParam,
        response: {
          200: DisputeMessageListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => listDisputeMessages(req.params.id, req.authUser!.id)),
  );

  r.post(
    "/disputes/:id/messages",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disputes"],
        summary: "Post a statement (optionally with evidence) to an open dispute (party only)",
        params: IdParam,
        body: DisputeMessageCreateSchema,
        response: {
          201: DisputeMessageSchema,
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
      const msg = await run(reply, () => postDisputeMessage(req.params.id, userId, req.body));
      if (msg) return reply.code(201).send(msg);
    },
  );

  r.get(
    "/disputes/:id/messages/:messageId/attachment",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disputes"],
        summary: "Short-lived signed URL for a statement's evidence (party only)",
        params: z.object({ id: z.string().uuid(), messageId: z.string().uuid() }),
        response: {
          200: z.object({ url: z.string() }),
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      const url = await run(reply, () =>
        signEvidenceUrl(req.params.id, req.params.messageId, userId, false),
      );
      if (url) return { url };
    },
  );

  // --- staff ---------------------------------------------------------------

  r.get(
    "/admin/disputes/:id/messages/:messageId/attachment",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Short-lived signed URL for a statement's evidence (staff)",
        params: z.object({ id: z.string().uuid(), messageId: z.string().uuid() }),
        response: {
          200: z.object({ url: z.string() }),
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const url = await run(reply, () =>
        signEvidenceUrl(req.params.id, req.params.messageId, null, true),
      );
      if (url) return { url };
    },
  );

  r.get(
    "/admin/disputes/:id/messages",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Full dispute thread (staff)",
        params: IdParam,
        response: {
          200: DisputeMessageListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => run(reply, () => listDisputeThreadStaff(req.params.id)),
  );

  r.post(
    "/admin/disputes/:id/messages",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Post a staff message into the dispute thread (visible to both parties)",
        params: IdParam,
        body: DisputeMessageCreateSchema.pick({ body: true }),
        response: {
          201: DisputeMessageSchema,
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
      const msg = await run(reply, () => postStaffDisputeMessage(req.params.id, staffId, req.body));
      if (msg) {
        await auditLog(staffId, "dispute_replied", "dispute", req.params.id, {});
        return reply.code(201).send(msg);
      }
    },
  );

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
      const resolved = await run(reply, () =>
        resolveDispute(req.params.id, staffId, req.body.resolution, req.body.note),
      );
      if (resolved) {
        await auditLog(staffId, "dispute_resolved", "dispute", req.params.id, {
          resolution: req.body.resolution,
          order_id: resolved.order_id,
        });
      }
      return resolved;
    },
  );
}
