import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  ConversationListResponseSchema,
  ConversationStartSchema,
  ConversationWithPartiesSchema,
  MessageCreateSchema,
  MessageListResponseSchema,
  MessageSchema,
  PaginationQuerySchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ConversationError,
  getConversation,
  listMessages,
  listMyConversations,
  sendMessage,
  startConversation,
} from "./conversations.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ConversationError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const IdParam = z.object({ id: z.string().uuid() });

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/conversations",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["messaging"],
        summary: "Start (or reuse) a conversation with a freelancer",
        body: ConversationStartSchema,
        response: { 201: ConversationWithPartiesSchema, 401: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      const convo = await run(reply, () =>
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        startConversation(req.authUser!.id, req.body.freelancer_id, req.body.gig_id ?? null),
      );
      if (convo) return reply.code(201).send(convo);
    },
  );

  r.get(
    "/conversations",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["messaging"],
        summary: "List the caller's conversations",
        querystring: PaginationQuerySchema,
        response: { 200: ConversationListResponseSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listMyConversations(req.authUser!.id, req.query),
  );

  r.get(
    "/conversations/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["messaging"],
        summary: "Get a conversation (participant only)",
        params: IdParam,
        response: { 200: ConversationWithPartiesSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => getConversation(req.params.id, req.authUser!.id)),
  );

  r.get(
    "/conversations/:id/messages",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["messaging"],
        summary: "List messages in a conversation (newest first, cursor-paginated)",
        params: IdParam,
        querystring: PaginationQuerySchema,
        response: {
          200: MessageListResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => listMessages(req.params.id, userId, req.query));
    },
  );

  r.post(
    "/conversations/:id/messages",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["messaging"],
        summary: "Send a message (participant only)",
        params: IdParam,
        body: MessageCreateSchema,
        response: {
          201: MessageSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const msg = await run(reply, () =>
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        sendMessage(req.params.id, req.authUser!.id, req.body.body),
      );
      if (msg) return reply.code(201).send(msg);
    },
  );
}
