import { z } from "zod";

export const AgencyRoleSchema = z.enum(["owner", "member"]);
export type AgencyRole = z.infer<typeof AgencyRoleSchema>;

export const AgencySchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Agency = z.infer<typeof AgencySchema>;

export const AgencyMemberSchema = z.object({
  profile_id: z.string().uuid(),
  role: AgencyRoleSchema,
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
});
export type AgencyMember = z.infer<typeof AgencyMemberSchema>;

/** The caller's agency view (or null when they aren't in one). */
export const MyAgencySchema = z
  .object({
    agency: AgencySchema,
    my_role: AgencyRoleSchema,
    members: z.array(AgencyMemberSchema),
  })
  .nullable();
export type MyAgency = z.infer<typeof MyAgencySchema>;

export const AgencyCreateSchema = z.object({ name: z.string().min(2).max(80) });
export const AgencyAddMemberSchema = z.object({ code: z.string().min(4).max(32) });
