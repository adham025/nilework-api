import { getDb } from "@/core/db";

/**
 * Append-only staff audit trail (admin-ops-portal-phase1 Req 10). Every
 * sensitive admin action calls this with the acting staff_users.id, a stable
 * action slug, and the affected resource. The table blocks UPDATE/DELETE by
 * trigger, so history cannot be rewritten.
 *
 * Best-effort by design: an audit-insert failure is logged loudly but never
 * blocks the underlying action — the action's own transaction has already
 * decided the business outcome.
 */
export async function auditLog(
  staffUserId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const sql = getDb();
    await sql`
      insert into public.audit_log (staff_user_id, action, resource_type, resource_id, details)
      values (${staffUserId}, ${action}, ${resourceType}, ${resourceId}, ${sql.json(details as never)})
    `;
  } catch (err) {
    console.error(`audit_log insert failed (${action} ${resourceType}/${resourceId}):`, err);
  }
}
