import { getDb } from "@/core/db";
import { grantPoints } from "@/modules/gamification/gamification.service";
import { notify } from "@/modules/notifications/notifications.service";
import type { CertifiedSkillSchema, SkillResult, SkillTestDetail } from "@nilework/schemas";
import type { z } from "zod";

/** Typed error so routes can map skill-test failures to HTTP codes. */
export class SkillError extends Error {
  constructor(
    public code: "not_found" | "conflict" | "bad_request",
    message: string,
  ) {
    super(message);
    this.name = "SkillError";
  }
}

interface Question {
  q: string;
  options: string[];
  answer: number;
}
interface TestRow {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  pass_percent: number;
  questions: Question[];
}

const COOLDOWN_HOURS = 24;
const PASS_POINTS = 100;

export async function listTests(): Promise<
  { slug: string; name_en: string; name_ar: string; pass_percent: number; question_count: number }[]
> {
  const sql = getDb();
  return sql`
    select slug, name_en, name_ar, pass_percent,
           jsonb_array_length(questions)::int as question_count
    from public.skill_tests where is_active = true order by name_en
  `;
}

/** A test with its questions, answers stripped (scoring is server-side). */
export async function getTest(slug: string): Promise<SkillTestDetail> {
  const sql = getDb();
  const rows = await sql<TestRow[]>`
    select id, slug, name_en, name_ar, pass_percent, questions
    from public.skill_tests where slug = ${slug} and is_active = true limit 1
  `;
  const test = rows[0];
  if (!test) throw new SkillError("not_found", "Test not found");
  return {
    slug: test.slug,
    name_en: test.name_en,
    name_ar: test.name_ar,
    pass_percent: test.pass_percent,
    questions: test.questions.map((q) => ({ q: q.q, options: q.options })),
  };
}

/** Score a submission server-side, record the result, and reward a first pass. */
export async function submitTest(
  profileId: string,
  slug: string,
  answers: number[],
): Promise<SkillResult> {
  const sql = getDb();
  const rows = await sql<TestRow[]>`
    select id, slug, name_en, name_ar, pass_percent, questions
    from public.skill_tests where slug = ${slug} and is_active = true limit 1
  `;
  const test = rows[0];
  if (!test) throw new SkillError("not_found", "Test not found");
  if (answers.length !== test.questions.length) {
    throw new SkillError("bad_request", "Answer count does not match the test");
  }

  // Cooldown: prevent brute-forcing answers by rapid re-takes.
  const recent = await sql<{ created_at: string }[]>`
    select created_at from public.skill_test_results
    where profile_id = ${profileId} and test_id = ${test.id}
      and created_at > now() - (${COOLDOWN_HOURS} || ' hours')::interval
    limit 1
  `;
  if (recent[0]) {
    throw new SkillError("conflict", `You can retake this test in ${COOLDOWN_HOURS}h`);
  }

  const correct = test.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  const scorePercent = Math.round((correct / test.questions.length) * 100);
  const passed = scorePercent >= test.pass_percent;

  const alreadyPassed = await sql<{ one: number }[]>`
    select 1 as one from public.skill_test_results
    where profile_id = ${profileId} and test_id = ${test.id} and passed = true limit 1
  `;

  await sql`
    insert into public.skill_test_results (profile_id, test_id, score_percent, passed)
    values (${profileId}, ${test.id}, ${scorePercent}, ${passed})
  `;

  if (passed && !alreadyPassed[0]) {
    await grantPoints(profileId, PASS_POINTS, `skill:${slug}`, "skill", test.id);
    await notify(profileId, "skill_certified", { slug });
  }

  return { score_percent: scorePercent, passed };
}

/** Public: a profile's certified skills (any passed test). */
export async function listCertified(
  profileId: string,
): Promise<z.infer<typeof CertifiedSkillSchema>[]> {
  const sql = getDb();
  return sql`
    select distinct t.slug, t.name_en, t.name_ar
    from public.skill_test_results r
    join public.skill_tests t on t.id = r.test_id
    where r.profile_id = ${profileId} and r.passed = true
    order by t.name_en
  `;
}
