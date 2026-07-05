import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  IdParamSchema,
  NotificationListResponseSchema,
  OkResponseSchema,
  PaginationQuerySchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { listNotifications, markAllRead, markRead } from "./notifications.service";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/notifications",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "List the caller's notifications + unread count",
        querystring: PaginationQuerySchema,
        response: { 200: NotificationListResponseSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listNotifications(req.authUser!.id, req.query),
  );

  r.post(
    "/me/notifications/:id/read",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "Mark one notification read",
        params: IdParamSchema,
        response: { 200: OkResponseSchema, 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      await markRead(req.authUser!.id, req.params.id);
      return { ok: true };
    },
  );

  r.post(
    "/me/notifications/read-all",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "Mark all notifications read",
        response: { 200: OkResponseSchema, 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      await markAllRead(req.authUser!.id);
      return { ok: true };
    },
  );
}
