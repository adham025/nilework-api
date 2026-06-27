import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getDb } from "./db";
import { verifyJwt } from "./supabase";

/** Hash an API key for lookup (we never store the plaintext). */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** The authenticated caller, attached to the request after requireAuth passes. */
export interface AuthUser {
  id: string;
  email: string | undefined;
}

/** A staff member, attached after requireStaff passes (MASTER_PLAN §6.2). */
export interface StaffUser {
  id: string;
  userId: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
    staffUser?: StaffUser;
  }
}

/**
 * Resolve the caller from either a Supabase Bearer JWT or an `X-API-Key` (§6.1) —
 * so the same endpoints serve the web app and external/programmatic clients. No
 * reply side effects; returns the user or null.
 */
async function authenticate(req: FastifyRequest): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    const user = await verifyJwt(token);
    if (user) return { id: user.id, email: user.email };
  }

  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0) {
    try {
      const rows = await getDb()<{ profile_id: string }[]>`
        select profile_id from public.api_keys
        where key_hash = ${hashApiKey(apiKey)} and revoked_at is null
        limit 1
      `;
      if (rows[0]) return { id: rows[0].profile_id, email: undefined };
    } catch {
      // DB unavailable (or unconfigured in tests) → treat as unauthenticated.
    }
  }

  return null;
}

/**
 * Fastify preHandler that enforces a valid Supabase user JWT (MASTER_PLAN §6.6).
 * Reads `Authorization: Bearer <jwt>`, verifies it, and attaches `req.authUser`.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await authenticate(req);
  if (!user) {
    await reply
      .code(401)
      .send({ error: { code: "unauthenticated", message: "Invalid or missing token" } });
    return;
  }
  req.authUser = user;
}

/**
 * Fastify preHandler for staff/ops-only endpoints (MASTER_PLAN §6.2). Requires a
 * valid JWT AND an active row in the isolated staff_users table. Attaches both
 * `req.authUser` and `req.staffUser`.
 */
export async function requireStaff(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await authenticate(req);
  if (!user) {
    await reply
      .code(401)
      .send({ error: { code: "unauthenticated", message: "Invalid or missing token" } });
    return;
  }

  const rows = await getDb()<{ id: string; user_id: string; staff_role: string }[]>`
    select id, user_id, staff_role
    from public.staff_users
    where user_id = ${user.id} and is_active = true
    limit 1
  `;
  const staff = rows[0];
  if (!staff) {
    await reply.code(403).send({ error: { code: "forbidden", message: "Staff access required" } });
    return;
  }

  req.authUser = user;
  req.staffUser = { id: staff.id, userId: staff.user_id, role: staff.staff_role };
}
