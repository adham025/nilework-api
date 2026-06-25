// Self-activating local CI gate (MASTER_PLAN §6.4): points git at .githooks/
// on every `npm install`, so a fresh clone gets the hooks with no manual step.
// No Husky / no dependency — just `git config core.hooksPath`.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

try {
  // Skip when installed as a dependency (no .git here) or in CI sandboxes.
  if (!existsSync(".git")) process.exit(0);
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
  console.log("✓ git hooks activated (.githooks)");
} catch {
  // Never fail an install because hook wiring didn't apply.
  process.exit(0);
}
