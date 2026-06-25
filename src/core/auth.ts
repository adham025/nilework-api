import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyJwt } from "./supabase";

/** The authenticated caller, attached to the request after requireAuth passes. */
export interface AuthUser {
  id: string;
  email: string | undefined;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

/**
 * Fastify preHandler that enforces a valid Supabase user JWT (MASTER_PLAN §6.6).
 * Reads `Authorization: Bearer <jwt>`, verifies it, and attaches `req.authUser`.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    await reply
      .code(401)
      .send({ error: { code: "unauthenticated", message: "Missing bearer token" } });
    return;
  }

  const user = await verifyJwt(token);
  if (!user) {
    await reply
      .code(401)
      .send({ error: { code: "unauthenticated", message: "Invalid or expired token" } });
    return;
  }

  req.authUser = { id: user.id, email: user.email };
}
