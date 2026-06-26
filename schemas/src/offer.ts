import { z } from "zod";

/** Offer lifecycle (§5.1). pending → accepted (becomes an order) / declined / withdrawn / expired. */
export const OfferStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
]);
export type OfferStatus = z.infer<typeof OfferStatusSchema>;

export const OfferSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  freelancer_id: z.string().uuid(),
  client_id: z.string().uuid(),
  gig_id: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string(),
  price_usd_minor: z.number().int().nonnegative(),
  delivery_days: z.number().int().positive(),
  status: OfferStatusSchema,
  order_id: z.string().uuid().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const OfferListSchema = z.array(OfferSchema);

/** A freelancer sends a custom offer in a conversation. Min price $5 (500 minor). */
export const OfferCreateSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  price_usd_minor: z.number().int().min(500),
  delivery_days: z.number().int().min(1).max(90),
  expires_in_days: z.number().int().min(1).max(30).optional(),
});
export type OfferCreateInput = z.infer<typeof OfferCreateSchema>;
