import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig `paths`: the vendored registry imports its sibling by
      // the upstream specifier, which only exists in the jerkai app.
      "@/lib/dashboard": fileURLToPath(new URL("./src/vendor", import.meta.url)),
    },
  },
  test: {
    // Two projects (PRD "Coverage Values over Read-Only Postgres" §4): the
    // node-env unit suite (DB-free, always run) and a disposable-Neon-branch
    // integration tier, discovered only once MCP_DATABASE_URL points at a
    // seeded branch. `extends: true` carries the root `resolve.alias` above
    // into both, since the vendored registry import needs it either way.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
