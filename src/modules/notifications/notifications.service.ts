import { getDb } from "@/core/db";
import type { Notification, NotificationListResponse, PaginationQuery } from "@nilework/schemas";
import { dispatchEmail } from "./email";

const COLUMNS = "id, user_id, type, data, read_at, created_at";

/**
 * Emit a notification (best-effort): a typed event other modules fire after their
 * main work. Deliberately swallows its own errors and is NOT part of any money
 * transaction — a failed notification must never roll back an order/payout (§6.7).
 */
export async function notify(
  userId: string,
  type: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const sql = getDb();
    await sql`
      insert into public.notifications (user_id, type, data)
      values (${userId}, ${type}, ${sql.json(data as never)})
    `;
  } catch (err) {
    console.error("notify failed:", err);
  }
  // Email counterpart for money/deadline types (best-effort, no-op if unconfigured).
  await dispatchEmail(userId, type);
}

export async function listNotifications(
  userId: string,
  query: PaginationQuery,
): Promise<NotificationListResponse> {
  const sql = getDb();
  const { limit } = query;
  const rows = await sql<Notification[]>`
    select ${sql.unsafe(COLUMNS)}
    from public.notifications
    where user_id = ${userId}
      ${query.cursor ? sql`and created_at < ${query.cursor}` : sql``}
    order by created_at desc
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const countRows = await sql<{ count: number }[]>`
    select count(*)::int as count from public.notifications
    where user_id = ${userId} and read_at is null
  `;

  return {
    items,
    next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null,
    unread_count: countRows[0]?.count ?? 0,
  };
}

export async function markRead(userId: string, id: string): Promise<void> {
  const sql = getDb();
  await sql`
    update public.notifications set read_at = now()
    where id = ${id} and user_id = ${userId} and read_at is null
  `;
}

export async function markAllRead(userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    update public.notifications set read_at = now()
    where user_id = ${userId} and read_at is null
  `;
}
