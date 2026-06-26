import { z } from "zod";

export const DisputeStatusSchema = z.enum(["open", "resolved"]);
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

export const DisputeResolutionSchema = z.enum(["release", "refund"]);
export type DisputeResolution = z.infer<typeof DisputeResolutionSchema>;

export const DisputeSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  opened_by: z.string().uuid(),
  opener_role: z.enum(["client", "freelancer"]),
  reason: z.string(),
  status: DisputeStatusSchema,
  resolution: DisputeResolutionSchema.nullable(),
  resolution_note: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Dispute = z.infer<typeof DisputeSchema>;

export const DisputeListSchema = z.array(DisputeSchema);

/** Open a dispute on an order. */
export const DisputeOpenSchema = z.object({
  reason: z.string().min(10).max(2000),
});
export type DisputeOpenInput = z.infer<typeof DisputeOpenSchema>;

/** Staff resolution: release escrow to the freelancer, or refund the client. */
export const DisputeResolveSchema = z.object({
  resolution: DisputeResolutionSchema,
  note: z.string().min(1).max(2000),
});
export type DisputeResolveInput = z.infer<typeof DisputeResolveSchema>;
