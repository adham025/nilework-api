import { z } from "zod";

/**
 * A typed notification event. `type` drives client-side i18n rendering; `data`
 * carries the ids/values the template needs (e.g. order_id) — §6.7. Kept as an
 * open string + record (not an enum) so the taxonomy can grow without a migration.
 */
export const NotificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: z.string(),
  data: z.record(z.unknown()),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationSchema),
  next_cursor: z.string().nullable(),
  unread_count: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
