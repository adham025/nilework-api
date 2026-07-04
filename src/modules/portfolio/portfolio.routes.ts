import { requireAuth } from "@/core/auth";
import { ApiErrorSchema } from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PortfolioError,
  importGithub,
  listPortfolio,
  removePortfolioItem,
} from "./portfolio.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, bad_request: 400, upstream: 502 } as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PortfolioError) {
      await reply
        .code(STATUS_BY_CODE[err.code])
        .send({ error: { code: err.code, message: err.message } });
      return undefined;
    }
    throw err;
  }
}

const PortfolioItemSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  source: z.enum(["github", "manual"]),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  meta: z.object({ language: z.string().nullable().optional(), stars: z.number().optional() }),
  created_at: z.string(),
});

/** Freelancer portfolio: public read + owner-managed GitHub import. */
export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/freelancers/:id/portfolio",
    {
      schema: {
        tags: ["marketplace"],
        summary: "A freelancer's public portfolio items",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.array(PortfolioItemSchema) },
      },
    },
    async (req) => listPortfolio(req.params.id),
  );

  r.post(
    "/me/portfolio/github",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["profiles"],
        summary: "Import public GitHub repos as portfolio items (keyless, idempotent)",
        body: z.object({ username: z.string().min(1).max(39) }),
        response: {
          200: z.object({ imported: z.number().int(), total: z.number().int() }),
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => importGithub(userId, req.body.username));
    },
  );

  r.delete(
    "/me/portfolio/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["profiles"],
        summary: "Remove one of the caller's portfolio items",
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      const done = await run(reply, () => removePortfolioItem(userId, req.params.id));
      if (done !== undefined) return { ok: true };
    },
  );
}
