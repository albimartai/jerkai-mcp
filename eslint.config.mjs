import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      // NFR-B: stdout belongs to the JSON-RPC stream. Diagnostics go to stderr.
      "no-console": ["error", { allow: ["error", "warn"] }],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "stdout",
          message: "stdout is reserved for the JSON-RPC stream (NFR-B). Use console.error.",
        },
      ],
    },
  },
  {
    // Vendored upstream code is byte-pinned; lint it as read-only.
    files: ["src/vendor/**/*.ts"],
    rules: {},
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.ts", "*.ts", "*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
      },
    },
  },
);
