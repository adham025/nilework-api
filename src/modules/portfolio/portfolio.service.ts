import { getDb } from "@/core/db";
import { ensureProfile } from "@/modules/profiles/profiles.service";

/** Typed error so routes can map portfolio failures to HTTP codes. */
export class PortfolioError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "bad_request" | "upstream",
    message: string,
  ) {
    super(message);
    this.name = "PortfolioError";
  }
}

export interface PortfolioItem {
  id: string;
  profile_id: string;
  source: "github" | "manual";
  title: string;
  description: string | null;
  url: string;
  meta: { language?: string | null; stars?: number };
  created_at: string;
}

const COLUMNS = "id, profile_id, source, title, description, url, meta, created_at";

/** Public: a freelancer's portfolio, newest first. */
export async function listPortfolio(profileId: string): Promise<PortfolioItem[]> {
  const sql = getDb();
  return sql<PortfolioItem[]>`
    select ${sql.unsafe(COLUMNS)} from public.portfolio_items
    where profile_id = ${profileId}
    order by created_at desc
    limit 24
  `;
}

interface GithubRepo {
  name: string;
  description: string | null;
  html_url: string;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
}

/**
 * Import a user's public GitHub repos as portfolio items (Phase-1 deferral
 * closed): keyless public API, top non-fork repos by recent push, idempotent
 * via unique(profile_id, url). Returns the number of items now present.
 */
export async function importGithub(
  profileId: string,
  username: string,
): Promise<{ imported: number; total: number }> {
  await ensureProfile(profileId);
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
    throw new PortfolioError("bad_request", "Invalid GitHub username");
  }

  let repos: GithubRepo[];
  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=12`,
      {
        headers: {
          "User-Agent": "nilework-portfolio-import",
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 404) throw new PortfolioError("not_found", "GitHub user not found");
    if (!res.ok) throw new PortfolioError("upstream", `GitHub responded ${res.status}`);
    repos = (await res.json()) as GithubRepo[];
  } catch (err) {
    if (err instanceof PortfolioError) throw err;
    throw new PortfolioError("upstream", "Could not reach GitHub");
  }

  const picks = repos.filter((r) => !r.fork).slice(0, 6);
  const sql = getDb();
  let imported = 0;
  for (const repo of picks) {
    const rows = await sql`
      insert into public.portfolio_items (profile_id, source, title, description, url, meta)
      values (${profileId}, 'github', ${repo.name}, ${repo.description},
              ${repo.html_url},
              ${sql.json({ language: repo.language, stars: repo.stargazers_count } as never)})
      on conflict (profile_id, url) do update
        set title = excluded.title, description = excluded.description, meta = excluded.meta
      returning (xmax = 0) as inserted
    `;
    if ((rows[0] as { inserted?: boolean })?.inserted) imported++;
  }

  const total = await sql<{ c: number }[]>`
    select count(*)::int as c from public.portfolio_items where profile_id = ${profileId}
  `;
  return { imported, total: total[0]?.c ?? 0 };
}

/** Owner removes one of their portfolio items. */
export async function removePortfolioItem(profileId: string, itemId: string): Promise<void> {
  const sql = getDb();
  const rows = await sql`
    delete from public.portfolio_items
    where id = ${itemId} and profile_id = ${profileId}
    returning id
  `;
  if (rows.length === 0) throw new PortfolioError("not_found", "Portfolio item not found");
}
