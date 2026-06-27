// Demo-data seeder (dev/staging only). Creates a few confirmed auth users via the
// Supabase admin API, then their profiles and a handful of active gigs — so a fresh
// deployment is immediately walkable. Idempotent: re-running reuses existing users
// and upserts rows. NEVER run against production data.
//
// Requires: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//   npm run seed
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");
  process.exit(1);
}

const PASSWORD = "Nilework!demo1";
const USERS = [
  { email: "amira.designer@nilework.dev", name: "Amira Hassan", freelancer: true, client: false },
  { email: "omar.writer@nilework.dev", name: "Omar Fathy", freelancer: true, client: false },
  { email: "client.nour@nilework.dev", name: "Nour Adel", freelancer: false, client: true },
];

const GIGS = [
  {
    email: "amira.designer@nilework.dev",
    category: "graphic-design",
    title: "I will design a modern brand logo",
    slug: "modern-brand-logo",
    description: "A clean, memorable logo with source files and two revisions.",
    price_usd_minor: 5000,
    delivery_days: 3,
  },
  {
    email: "omar.writer@nilework.dev",
    category: "content-writing",
    title: "I will write SEO blog articles in Arabic and English",
    slug: "seo-blog-articles-ar-en",
    description: "Well-researched, original articles up to 1000 words, bilingual.",
    price_usd_minor: 3000,
    delivery_days: 2,
  },
];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

/** Create the auth user (or find it if it already exists) and return its id. */
async function ensureUser(email) {
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.data?.user) return created.data.user.id;

  // Already registered — page through users to find it.
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const match = data?.users.find((u) => u.email === email);
    if (match) return match.id;
    if (!data || data.users.length < 200) break;
  }
  throw new Error(`could not create or find user ${email}`);
}

try {
  const idByEmail = new Map();
  for (const u of USERS) {
    const id = await ensureUser(u.email);
    idByEmail.set(u.email, id);
    await sql`
      insert into public.profiles (id, display_name, is_client, is_freelancer, onboarding_completed)
      values (${id}, ${u.name}, ${u.client}, ${u.freelancer}, true)
      on conflict (id) do update set
        display_name = excluded.display_name,
        is_client = excluded.is_client,
        is_freelancer = excluded.is_freelancer,
        onboarding_completed = true
    `;
    console.log(`✓ user + profile  ${u.email}`);
  }

  for (const g of GIGS) {
    const freelancerId = idByEmail.get(g.email);
    const [cat] = await sql`select id from public.categories where slug = ${g.category} limit 1`;
    if (!cat) {
      console.warn(`• skip gig (no category ${g.category})`);
      continue;
    }
    await sql`
      insert into public.gigs
        (freelancer_id, category_id, title, slug, description, price_usd_minor, delivery_days, status)
      values
        (${freelancerId}, ${cat.id}, ${g.title}, ${g.slug}, ${g.description},
         ${g.price_usd_minor}, ${g.delivery_days}, 'active')
      on conflict (slug) do nothing
    `;
    console.log(`✓ gig            ${g.slug}`);
  }

  console.log(`\nDone. Demo login password for all seeded users: ${PASSWORD}`);
} catch (err) {
  console.error("seed failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
