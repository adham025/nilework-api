import { z } from "zod";

/** The order/escrow state machine (§6). pending_payment → funded → delivered → released. */
export const OrderStatusSchema = z.enum([
  "pending_payment",
  "funded",
  "delivered",
  "released",
  "refunded",
  "cancelled",
  "disputed",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** An order row. gross = commission + net, all in canonical USD minor units. */
export const OrderSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  freelancer_id: z.string().uuid(),
  gig_id: z.string().uuid().nullable(),
  title: z.string(),
  gross_usd_minor: z.number().int().nonnegative(),
  commission_usd_minor: z.number().int().nonnegative(),
  net_usd_minor: z.number().int().nonnegative(),
  commission_bps: z.number().int().nonnegative(),
  fx_rate_id: z.string().uuid().nullable(),
  delivery_days: z.number().int().positive(),
  status: OrderStatusSchema,
  delivered_at: z.string().nullable(),
  released_at: z.string().nullable(),
  auto_release_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

/** Privacy-filtered counterparty info embedded in order detail/listings. */
export const OrderPartyRefSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const OrderWithPartiesSchema = OrderSchema.extend({
  client: OrderPartyRefSchema,
  freelancer: OrderPartyRefSchema,
});
export type OrderWithParties = z.infer<typeof OrderWithPartiesSchema>;

export const OrderListResponseSchema = z.object({
  items: z.array(OrderWithPartiesSchema),
  next_cursor: z.string().nullable(),
});
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

/** A state-transition audit record. */
export const OrderEventSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  from_status: OrderStatusSchema.nullable(),
  to_status: OrderStatusSchema,
  actor_id: z.string().uuid().nullable(),
  actor_role: z.enum(["client", "freelancer", "system"]),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type OrderEvent = z.infer<typeof OrderEventSchema>;

/** Order detail = the order, both parties, and its event timeline. */
export const OrderDetailSchema = OrderWithPartiesSchema.extend({
  events: z.array(OrderEventSchema),
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

/** Create an order by purchasing a gig (client action). */
export const OrderCreateSchema = z.object({
  gig_id: z.string().uuid(),
});
export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;

/** Filter the caller's orders by the role they play in them. */
export const OrderListQuerySchema = z.object({
  role: z.enum(["client", "freelancer"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;
