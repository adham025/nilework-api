import { defineConfig } from "tsup";

// Two entrypoints, one codebase (MASTER_PLAN §6.6): the HTTP API and the
// queue/cron worker share the same modules and are bundled separately.
export default defineConfig({
  entry: ["src/server.ts", "src/worker.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
});
