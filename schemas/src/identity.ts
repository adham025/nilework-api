import { z } from "zod";
import { IdVerificationStatusSchema } from "./profile.js";

/** Start phone verification: an E.164-ish phone number. */
export const PhoneStartSchema = z.object({
  phone: z.string().min(8).max(20),
});
export type PhoneStartInput = z.infer<typeof PhoneStartSchema>;

export const PhoneVerifySchema = z.object({
  code: z.string().length(6),
});
export type PhoneVerifyInput = z.infer<typeof PhoneVerifySchema>;

export const PhoneStartResultSchema = z.object({
  sent: z.boolean(),
  // In dev "log" mode the API returns the code so local testing needs no provider.
  dev_code: z.string().nullable(),
});

/** Submit a national-ID verification. Document paths are storage keys uploaded by the client. */
export const IdentitySubmitSchema = z.object({
  full_name: z.string().min(2).max(120),
  national_id_number: z.string().min(5).max(40),
  front_path: z.string().min(1).max(300),
  back_path: z.string().min(1).max(300).optional(),
});
export type IdentitySubmitInput = z.infer<typeof IdentitySubmitSchema>;

export const IdVerificationSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  full_name: z.string(),
  national_id_number: z.string(),
  front_path: z.string(),
  back_path: z.string().nullable(),
  status: z.enum(["pending", "approved", "rejected"]),
  review_note: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string(),
  // Same national ID already approved on another account (identity Req 8).
  flagged_duplicate: z.boolean().default(false),
});
export type IdVerification = z.infer<typeof IdVerificationSchema>;

export const IdVerificationListSchema = z.array(IdVerificationSchema);

/** Caller's current verification state (phone + ID), for the verify page. */
export const VerificationStatusSchema = z.object({
  phone: z.string().nullable(),
  phone_verified: z.boolean(),
  id_verification_status: IdVerificationStatusSchema,
  latest_id: IdVerificationSchema.nullable(),
});
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const IdRejectSchema = z.object({ note: z.string().min(1).max(500) });

export const SignedUrlResponseSchema = z.object({ url: z.string() });
