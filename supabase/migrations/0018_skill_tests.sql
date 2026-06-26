-- 0018_skill_tests — Skill tests & certifications (slice #28, Phase 3). Freelancers
-- take a short test; passing earns a verified-skill badge (shown on gigs) + points.
-- Correct answers live only in the DB and are stripped by the API before serving —
-- scoring is server-side. Tests are service-role only (answers hidden); results are
-- append-only and owner-readable.

create table if not exists public.skill_tests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null,
  pass_percent int not null default 70 check (pass_percent between 1 and 100),
  questions jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.skill_tests enable row level security;

insert into public.skill_tests (slug, name_en, name_ar, pass_percent, questions) values
  (
    'web-fundamentals', 'Web Fundamentals', 'أساسيات الويب', 70,
    '[
      {"q":"Which HTML tag creates a hyperlink?","options":["<a>","<p>","<h1>","<div>"],"answer":0},
      {"q":"Which is a valid CSS property?","options":["color","onclick","href","src"],"answer":0},
      {"q":"What does HTTP status 404 mean?","options":["OK","Not Found","Server Error","Redirect"],"answer":1},
      {"q":"Which keyword declares a block-scoped variable in JS?","options":["var","let","function","static"],"answer":1}
    ]'::jsonb
  ),
  (
    'graphic-design-basics', 'Graphic Design Basics', 'أساسيات التصميم الجرافيكي', 70,
    '[
      {"q":"Which color model is used for print?","options":["RGB","CMYK","HSL","HEX"],"answer":1},
      {"q":"Which file format supports transparency?","options":["JPEG","PNG","BMP","GIF"],"answer":1},
      {"q":"What does kerning adjust?","options":["Line height","Space between letters","Image size","Color balance"],"answer":1}
    ]'::jsonb
  )
on conflict (slug) do nothing;

create table if not exists public.skill_test_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  test_id uuid not null references public.skill_tests (id),
  score_percent int not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_skill_results_profile on public.skill_test_results (profile_id, test_id, created_at desc);

drop trigger if exists trg_skill_results_immutable on public.skill_test_results;
create trigger trg_skill_results_immutable
  before update or delete on public.skill_test_results
  for each row execute function public.forbid_mutation();

alter table public.skill_test_results enable row level security;

drop policy if exists skill_results_select_own on public.skill_test_results;
create policy skill_results_select_own on public.skill_test_results
  for select using (auth.uid() = profile_id);
