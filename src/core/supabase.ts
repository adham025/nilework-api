import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Service-role Supabase client — used for privileged operations (Storage,
 * admin auth actions). Bypasses RLS; never expose to clients (MASTER_PLAN §6.2).
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Verify a Supabase user JWT and return the authenticated user, or null.
 * Uses the anon client's getUser(token) so no JWT secret is needed here.
 */
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function verifyJwt(token: string) {
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
