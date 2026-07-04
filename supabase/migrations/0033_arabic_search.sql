-- 0033_arabic_search — Dialect-tolerant gig search (Phase 4c: intelligence).
-- Egyptian users type the same word many ways: alef with/without hamza
-- (أحمد/احمد), teh marbuta vs heh (مكتبة/مكتبه), alef maqsura vs yeh (على/علي),
-- with or without diacritics. normalize_arabic() folds those variants so
-- "تصميم" finds "التصميم" spelled any way, and a generated tsvector + GIN index
-- makes it fast. Trigram (pg_trgm) covers typos/partial words in both scripts.
-- No external search service — Postgres does this for free.

create extension if not exists pg_trgm;

create or replace function public.normalize_arabic(input text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    -- strip tashkeel (fathatan..sukun U+064B–U+0652) and tatweel (U+0640)
    regexp_replace(lower(coalesce(input, '')), '[ً-ْـ]', '', 'g'),
    -- fold: 4 alef variants → ا, teh marbuta → ه, alef maqsura → ي
    -- (source and target MUST be the same length: 6 → 6)
    'أإآٱةى',
    'ااااهي'
  );
$$;

-- Generated search document over title + description, Arabic-folded.
alter table public.gigs
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('simple', public.normalize_arabic(title || ' ' || description))
  ) stored;

create index if not exists idx_gigs_search_tsv on public.gigs using gin (search_tsv);
create index if not exists idx_gigs_title_trgm
  on public.gigs using gin (public.normalize_arabic(title) gin_trgm_ops);
