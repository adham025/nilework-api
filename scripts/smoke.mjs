// Post-deploy smoke test. Hits a running API and asserts the public surface is
// healthy; if NILEWORK_API_KEY is set, it also walks authenticated /me endpoints
// using the X-API-Key header (created from the dashboard). Exits non-zero on the
// first failure so it can gate a deploy.
//
//   API_BASE=https://api.nilework.com NILEWORK_API_KEY=nw_... npm run smoke
import "dotenv/config";

const BASE = (process.env.API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const API_KEY = process.env.NILEWORK_API_KEY;

let failures = 0;

async function check(name, path, { auth = false, expect = 200 } = {}) {
  const headers = {};
  if (auth && API_KEY) headers["x-api-key"] = API_KEY;
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    const ok = res.status === expect;
    console.log(`${ok ? "✓" : "✗"} ${name.padEnd(28)} ${res.status} ${path}`);
    if (!ok) failures++;
    return ok ? await res.json().catch(() => null) : null;
  } catch (err) {
    console.log(`✗ ${name.padEnd(28)} ERROR ${path} — ${err.message}`);
    failures++;
    return null;
  }
}

console.log(`Smoke testing ${BASE}\n`);

const health = await check("health", "/v1/health");
if (health) console.log(`   db: ${health.checks?.database}`);

await check("categories", "/v1/categories");
const gigs = await check("gigs list", "/v1/gigs");
const firstGig = gigs?.items?.[0];
if (firstGig?.slug) await check("gig detail", `/v1/gigs/${firstGig.slug}`);
await check("leaderboard", "/v1/leaderboard");

if (API_KEY) {
  console.log("\nAuthenticated (X-API-Key):");
  await check("me/profile", "/v1/me", { auth: true });
  await check("me/orders", "/v1/me/orders", { auth: true });
  await check("me/streak", "/v1/me/streak", { auth: true });
} else {
  console.log("\n(set NILEWORK_API_KEY to also walk authenticated endpoints)");
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
