import { z } from "zod";

export const HourlyContractSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  freelancer_id: z.string().uuid(),
  title: z.string(),
  hourly_rate_usd_minor: z.number().int().positive(),
  status: z.enum(["active", "ended"]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type HourlyContract = z.infer<typeof HourlyContractSchema>;

export const HourlyContractListSchema = z.array(HourlyContractSchema);

export const TimeLogSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  minutes: z.number().int().positive(),
  description: z.string(),
  status: z.enum(["logged", "approved", "billed"]),
  order_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type TimeLog = z.infer<typeof TimeLogSchema>;

export const HourlyContractDetailSchema = HourlyContractSchema.extend({
  logs: z.array(TimeLogSchema),
});
export type HourlyContractDetail = z.infer<typeof HourlyContractDetailSchema>;

/** Client hires a freelancer hourly. Min rate $1/hr (100 minor). */
export const HourlyContractCreateSchema = z.object({
  freelancer_id: z.string().uuid(),
  title: z.string().min(3).max(120),
  hourly_rate_usd_minor: z.number().int().min(100),
});
export type HourlyContractCreateInput = z.infer<typeof HourlyContractCreateSchema>;

/** Freelancer logs time. 1 minute … 24h per entry. */
export const TimeLogCreateSchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  description: z.string().min(2).max(500),
});
export type TimeLogCreateInput = z.infer<typeof TimeLogCreateSchema>;
