import { z } from "zod";

export const SkillTestSummarySchema = z.object({
  slug: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  pass_percent: z.number().int(),
  question_count: z.number().int().nonnegative(),
});
export const SkillTestListSchema = z.array(SkillTestSummarySchema);

/** A question as served to the client — options only, never the correct answer. */
export const SkillQuestionSchema = z.object({
  q: z.string(),
  options: z.array(z.string()),
});

export const SkillTestDetailSchema = z.object({
  slug: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  pass_percent: z.number().int(),
  questions: z.array(SkillQuestionSchema),
});
export type SkillTestDetail = z.infer<typeof SkillTestDetailSchema>;

/** Submit answers as the selected option index per question. */
export const SkillSubmitSchema = z.object({
  answers: z.array(z.number().int().min(0)).min(1),
});
export type SkillSubmitInput = z.infer<typeof SkillSubmitSchema>;

export const SkillResultSchema = z.object({
  score_percent: z.number().int(),
  passed: z.boolean(),
});
export type SkillResult = z.infer<typeof SkillResultSchema>;

export const CertifiedSkillSchema = z.object({
  slug: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
});
export const CertifiedSkillListSchema = z.array(CertifiedSkillSchema);
