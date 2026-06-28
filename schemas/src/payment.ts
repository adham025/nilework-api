import { z } from "zod";

/**
 * Checkout result. provider 'paymob' / 'kashier' returns a hosted redirect_url the
 * client opens to pay; provider 'simulated' (dev, no gateway keys) means escrow was
 * funded directly and the client just refreshes the order. The web only follows
 * redirect_url, so it is provider-agnostic.
 */
export const CheckoutResponseSchema = z.object({
  provider: z.enum(["paymob", "kashier", "simulated"]),
  redirect_url: z.string().nullable(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
