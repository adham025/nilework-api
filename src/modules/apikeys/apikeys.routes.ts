import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  ApiKeyCreateSchema,
  ApiKeyCreatedSchema,
  ApiKeyListSchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiKey, listApiKeys, revokeApiKey } from "./apikeys.service";

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/api-keys",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["api-keys"],
        summary: "List the caller's API keys (no secrets)",
        response: { 200: ApiKeyListSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listApiKeys(req.authUser!.id),
  );

  r.post(
    "/me/api-keys",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["api-keys"],
        summary: "Create an API key (plaintext returned once)",
        body: ApiKeyCreateSchema,
        response: { 201: ApiKeyCreatedSchema, 401: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const created = await createApiKey(req.authUser!.id, req.body.name);
      return reply.code(201).send(created);
    },
  );

  r.delete(
    "/me/api-keys/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["api-keys"],
        summary: "Revoke an API key",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ ok: z.boolean() }), 401: ApiErrorSchema },
      },
    },
    async (req) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      await revokeApiKey(req.authUser!.id, req.params.id);
      return { ok: true };
    },
  );
}
