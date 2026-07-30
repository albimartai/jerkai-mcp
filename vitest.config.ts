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
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
