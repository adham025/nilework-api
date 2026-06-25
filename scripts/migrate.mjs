// Minimal forward-only migration runner (MASTER_PLAN §6.4).
// Applies supabase/migrations/*.sql in order against DATABASE_URL, tracking
// applied files in a schema_migrations table. CLI-compatible file layout, so
// the Supabase CLI can take over later without restructuring.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const dir = "supabase/migrations";

try {
  await sql.unsafe(
    "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const [done] = await sql`select 1 from public.schema_migrations where name = ${file}`;
    if (done) {
      console.log(`• skip   ${file}`);
      continue;
    }
    const content = await readFile(join(dir, file), "utf8");
    await sql.unsafe(content);
    await sql`insert into public.schema_migrations (name) values (${file})`;
    console.log(`✓ applied ${file}`);
  }
  console.log("migrations up to date");
} catch (err) {
  console.error("migration failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
