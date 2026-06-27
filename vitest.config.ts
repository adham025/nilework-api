import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    // Integration tests boot a full Fastify instance in beforeAll; allow headroom
    // on slow/loaded machines so the suite isn't flaky (default 5s is too tight).
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
