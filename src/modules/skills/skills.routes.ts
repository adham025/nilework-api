import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  CertifiedSkillListSchema,
  SkillResultSchema,
  SkillSubmitSchema,
  SkillTestDetailSchema,
  SkillTestListSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { SkillError, getTest, listCertified, listTests, submitTest } from "./skills.service";

const STATUS_BY_CODE = { not_found: 404, conflict: 409, bad_request: 400 } as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SkillError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const SlugParam = z.object({ slug: z.string().min(1).max(60) });

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/skill-tests",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["skills"],
        summary: "List available skill tests",
        response: { 200: SkillTestListSchema, 401: ApiErrorSchema },
      },
    },
    async () => listTests(),
  );

  r.get(
    "/skill-tests/:slug",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["skills"],
        summary: "Get a skill test's questions (answers not included)",
        params: SlugParam,
        response: { 200: SkillTestDetailSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (req, reply) => run(reply, () => getTest(req.params.slug)),
  );

  r.post(
    "/skill-tests/:slug/submit",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["skills"],
        summary: "Submit a skill test for scoring",
        params: SlugParam,
        body: SkillSubmitSchema,
        response: {
          200: SkillResultSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => submitTest(userId, req.params.slug, req.body.answers));
    },
  );

  r.get(
    "/profiles/:id/skills",
    {
      schema: {
        tags: ["skills"],
        summary: "Public: a profile's certified skills",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: CertifiedSkillListSchema },
      },
    },
    async (req) => listCertified(req.params.id),
  );
}
