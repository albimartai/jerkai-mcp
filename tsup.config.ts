import { defineConfig } from "tsup";

// Everything the server needs is bundled into a single dist/server.js so that
// `node dist/server.js` runs with no loader, no path-alias hook, and no
// ERR_MODULE_NOT_FOUND from the vendored `@/lib/dashboard/*` specifier.
export default defineConfig({
  entry: { server: "src/server.ts" },
  format: ["esm"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  // Bundle dependencies too: the built server is meant to be run directly by
  // an MCP client, not resolved against a node_modules tree.
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node" },
});
