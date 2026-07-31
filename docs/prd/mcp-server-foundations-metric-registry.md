# PRD: MCP Server Foundations & Metric Registry (Slice 1)

> **Status:** **Shipped 2026-07-29** — `albimartai/jerkai-mcp` PR #1 (`32945c7`). This document is the spec of record for the shipped server and describes its current state.
> **Authored outside the vault and outside Claude**, deliberately: the vault's house PRD format had reached ~16k words per slice and became unmanageable. This is the sole version — it supersedes every earlier vault MCP draft (all deleted, see [[JerkAI - Decision Log]]).
> **Id series:** `AC-MF*` and `NFR-A`–`NFR-D`, local to this repo. The earlier `AC-QT*` / `NFR-63`–`NFR-80` allocation was never built and no longer resolves.

---

## Post-ship correction — 2026-07-31

One factual error in this PRD's description of the code, surfaced by the Session Prompt J build session (`jerkai-mcp@6799c01`) while authoring the repo's agent context. Recorded here rather than edited in place, so the shipped text stays readable as what the build was handed.

**§4.1, step 3 — "Metric Extraction" — is wrong about the import graph.** It reads:

> Handler imports `DASHBOARD_METRICS` from `src/config.ts` (which aggregates and re-exports metric definitions from both `src/vendor/types.ts` and `src/vendor/strain.ts`).

`src/config.ts` imports from **`src/vendor/types.ts` only** — a single statement, `import { DASHBOARD_METRICS as VENDORED_METRICS } from "./vendor/types.js"`. It never imports `src/vendor/strain.ts`. Day Strain reaches the registry **indirectly**, because `types.ts` itself imports `DAY_STRAIN_METRIC` from `strain.ts` — an upstream edge inherited verbatim from `jerkai`'s `lib/dashboard/types.ts`, which is why it survives the byte-pin.

**Nothing built is wrong.** The shipped behavior is correct and `AC-MF5a` (the response key set equals `Object.keys(DASHBOARD_METRICS)`) passes on the real single-import path. Only this sentence's account of *how* the registry is assembled is inaccurate. Both vendored files remain load-bearing, and both remain locked in `vendor.lock.json`.

**Why it matters anyway.** A reader planning slice 1b would infer two independent vendor imports into `config.ts` and design around a structure that does not exist.

---

## 0. Definition of Ready (DoR)

Before initiating implementation of this slice, the following prerequisites must be met:

1. **Vendor Definitions Pinned:** Upstream metric registry files (`lib/dashboard/types.ts` and `lib/dashboard/strain.ts`) are vendored locally at `src/vendor/types.ts` and `src/vendor/strain.ts`, and their SHA is recorded in `vendor.lock.json`.
2. **SDK Verification:** `@modelcontextprotocol/sdk` v1.x interface types are verified against `node_modules/@modelcontextprotocol/sdk` strictly using the high-level `McpServer` class and `server.tool(...)` / `server.registerTool(...)` registration methods from `@modelcontextprotocol/sdk/server/mcp.js`, declaring parameter and response schemas via Zod object schemas with `.strict()` to enforce closed properties (`additionalProperties: false`).
3. **Environment Isolation:** Local Node.js environment (v18+) and Vitest harness are initialized.

### 0.1 Open Questions & Fallback Defaults

- **Open Questions:** None — scope, data boundaries, and vendor types are fully deterministic.
- **Fallback Defaults:** If upstream metric types introduce non-biometric or unknown schema keys, `src/config.ts` must filter them out, retaining only valid metrics entries.

---

## 1. Overview & Goal

Build a local, read-only Model Context Protocol (MCP) server running over standard input/output (stdio). The server exposes a single tool, `list_available_metrics`, which informs the model which biometric axes are queryable, their sources, and system boundaries (e.g., lack of nutrition data and causal reasoning). This slice operates without any database connections or external API credentials. All metadata is derived directly from local registry files.

---

## 2. What this slice is NOT (System Boundaries & Exclusions)

- **NO Database Dependencies:** No database drivers (e.g., `pg`, `@neondatabase/serverless`, `drizzle-orm`, `prisma`, `better-sqlite3`, `mysql2`), ORMs, credentials, or SQL queries may exist in `package.json` or any file under `src/`.
- **NO Data Aggregation/Values:** Fields for ranges, unit values, counts, and historical data (`unit`, `earliestDay`, `latestDay`, `dayCount`, `gapDays`) MUST be returned as `null`.
- **NO Network Transports:** HTTP, SSE, or remote deployments are out of scope. Transport is strictly stdio.
- **NO Writes / Resources / Prompts:** MCP prompts, resources, and write mechanisms are not included.

---

## 3. Tool Specifications

**Tool: `list_available_metrics`**

### Metadata

- **Name:** `list_available_metrics`
- **Description:** Must include the exact string phrases:
  - `"no nutrition or energy-balance data"`
  - `"states no cause"`
- **Input Schema:** Zod object accepting an empty object (`z.object({}).strict()`). Closed parameters (`additionalProperties: false`).
- **Output Schema:** Zod object schema declared with `.strict()` mapping to the JSON Schema:

```json
{
  "type": "object",
  "required": ["metrics", "caveats"],
  "properties": {
    "metrics": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "key", "source", "metric", "unit",
          "earliestDay", "latestDay", "dayCount", "gapDays"
        ],
        "additionalProperties": false
      }
    },
    "caveats": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "additionalProperties": false
}
```

### Internal Domain Payload Structure

The internal execution result object contains `metrics` and `caveats`:

```json
{
  "metrics": [
    {
      "key": "string",
      "source": "string",
      "metric": "string",
      "unit": null,
      "earliestDay": null,
      "latestDay": null,
      "dayCount": null,
      "gapDays": null
    }
  ],
  "caveats": ["string"]
}
```

### Field Specifications

1. **`key` / `source` / `metric`:** Derived dynamically from the local metric registries (`src/vendor/types.ts` and `src/vendor/strain.ts`).
2. **`unit`, `earliestDay`, `latestDay`, `dayCount`, `gapDays`:** MUST be explicitly `null`. `dayCount` must be `null`, never `0`.
3. **`caveats`:** Automatically populated array of text strings detailing limitations, including:
   - Specific mention that `"unit"` and `"coverage"` are `"not yet reported by this server"`.
   - Dynamic entries for specific source caveats (e.g., proprietary metric notes for Whoop metrics if present).
   - The verbatim text of all caveats must also appear in the MCP `content` text payload array returned over the protocol.

---

## 4. Architecture & Repo Structure

```text
.
├── .env.example
├── .gitignore
├── .gitleaks.toml
├── .husky/
│   └── pre-commit
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── vendor-drift.yml
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── eslint.config.mjs
├── vitest.config.ts
├── vendor.lock.json
├── README.md
├── scripts/
│   ├── check-vendor-drift.mjs
│   └── smoke-stdio.mjs
├── src/
│   ├── config.ts
│   ├── caveats.ts
│   ├── schema-guards.ts
│   ├── server.ts
│   ├── tools/
│   │   └── list-available-metrics.ts
│   └── vendor/
│       ├── types.ts
│       └── strain.ts
└── tests/
    └── unit/
        ├── list-available-metrics.test.ts
        ├── schema-guards.test.ts
        └── vendor-drift.test.ts
```

### 4.1 Module Execution Sequence & Data Flow

When a client invokes `list_available_metrics` over stdio:

1. **Bootstrap:** `src/server.ts` initializes the `McpServer` instance, registers tool definitions from `src/tools/list-available-metrics.ts` via `server.tool(...)` / `server.registerTool(...)` (using Zod `.strict()` object schemas), and connects to `StdioServerTransport`.
2. **Tool Invocation:** The handler in `src/tools/list-available-metrics.ts` receives the request frame.
3. **Metric Extraction:** Handler imports `DASHBOARD_METRICS` from `src/config.ts` (which aggregates and re-exports metric definitions from both `src/vendor/types.ts` and `src/vendor/strain.ts`).
4. **Metric Mapping:** Handler constructs the metrics array, setting `key`, `source`, and `metric` from the registry and assigning `null` to `unit`, `earliestDay`, `latestDay`, `dayCount`, and `gapDays`.
5. **Caveat Generation:** Handler passes the formatted metrics array to `deriveCaveats(metrics)` in `src/caveats.ts`.
6. **Payload Construction:** Handler assembles the domain payload `{ metrics, caveats }`.
7. **Payload Validation:** Handler passes the assembled domain payload through the key whitelist validator exported from `src/schema-guards.ts` to strictly verify that no unwhitelisted properties are present before emitting output.
8. **Response Emission:** Handler returns dual-channel MCP response payload matching the registered Zod output schema:
   - `content`: Array of text blocks containing JSON stringified domain metrics and verbatim stringified caveats.
   - `structuredContent` (or tool result object): The validated domain payload `{ metrics, caveats }`.

### 4.2 Scope & File Impact Budget

To maintain strict boundaries during implementation, changes and file creations are explicitly capped to the following allocations:

- **Root Configuration & Metadata:** 13 files (`.env.example`, `.gitignore`, `.gitleaks.toml`, `.husky/pre-commit`, `.github/workflows/ci.yml`, `.github/workflows/vendor-drift.yml`, `package.json`, `tsconfig.json`, `tsup.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `vendor.lock.json`, `README.md`)
- **Executable Scripts:** 2 files (`scripts/check-vendor-drift.mjs`, `scripts/smoke-stdio.mjs`)
- **Source Modules:** 7 files (`src/config.ts`, `src/caveats.ts`, `src/schema-guards.ts`, `src/server.ts`, `src/tools/list-available-metrics.ts`, `src/vendor/types.ts`, `src/vendor/strain.ts`)
- **Unit Tests:** 3 files (`tests/unit/list-available-metrics.test.ts`, `tests/unit/schema-guards.test.ts`, `tests/unit/vendor-drift.test.ts`)
- **Maximum Touch Limit:** 25 files total. Refactoring shared external modules or adding files outside this explicitly budgeted manifest is strictly prohibited.

---

## 5. Technical Risks & Implementation Pitfalls

1. **ESM Path Alias Resolution (`ERR_MODULE_NOT_FOUND`):** TypeScript path aliases (e.g., `@/*`) are ignored by Node.js at runtime. The build step (tsup bundling to `dist/server.js`) must bundle or resolve path specifiers so that executing `node dist/server.js` requires no custom path loaders.
2. **Standard Output Contamination:** Any `console.log` or unhandled write to stdout corrupts the JSON-RPC stream. All diagnostics, startup messages, and error logging MUST use `console.error` (stderr).
3. **Type Erasure on Key Whitelist Walk:** Untyped SDK handlers can bypass payload validation. The key whitelist walker exported from `src/schema-guards.ts` must evaluate the internal domain payload (`{ metrics, caveats }`), ignoring protocol envelope wrappers, and fail loudly if it visits zero keys or encounters unwhitelisted properties during execution.

---

## 6. Non-Functional Requirements (NFRs)

- **NFR-A (Closed Input & Output Schema):** Input parameters and output results for all MCP tools must strictly constrain parameters and response objects (`additionalProperties: false` via Zod `.strict()`). Untyped or bare `type: "string"` declarations are forbidden.
- **NFR-B (Clean Standard Output):** stdout is reserved strictly for JSON-RPC protocol messages. All diagnostics, logs, or debug notices must go to stderr. No `console.log` or `process.stdout.write` statements are permitted under `src/`.
- **NFR-C (Dependency Constraints):** Zero database clients or drivers permitted in dependencies or import statements (including `pg`, `@neondatabase/serverless`, `drizzle-orm`, `prisma`, `better-sqlite3`, `sqlite3`, `mysql2`, `knex`, `typeorm`).
- **NFR-D (Payload Whitelisting & Filtering):** Internal domain response payloads and registry loaders must validate keys at runtime against explicit property whitelists (`metrics`, `caveats`, `key`, `source`, `metric`, `unit`, `earliestDay`, `latestDay`, `dayCount`, `gapDays`) using the validator module in `src/schema-guards.ts`. Protocol envelope keys (`content`, `isError`, `type`, `text`) and JSON schema keywords are excluded from domain whitelist checks.

---

## 7. Acceptance Criteria & Test Tiering Matrix

- **AC-MF1a: Tool Registration over Protocol** *[Tier: Stdio Integration / Script]*
  - Given the MCP server is running over stdio using `McpServer`,
  - When a client completes the initial JSON-RPC handshake and requests `tools/list`,
  - Then the server returns exactly one tool (`list_available_metrics`).

- **AC-MF1b-1: Database Package Dependency Guard** *[Tier: Unit Test]*
  - Given `package.json`,
  - When inspecting `dependencies` and `devDependencies`,
  - Then zero database packages or ORMs (`pg`, `@neondatabase/serverless`, `drizzle-orm`, `prisma`, `better-sqlite3`, `sqlite3`, `mysql2`, `knex`, `typeorm`) exist.

- **AC-MF1b-2: AST Import Guard for Database Drivers** *[Tier: Unit Test]*
  - Given the source codebase,
  - When AST-parsing all TypeScript files under `src/**`,
  - Then zero database driver or ORM import statements exist anywhere under `src/**`.

- **AC-MF1b-3: AST Standard Output Pollution Guard** *[Tier: Unit Test]*
  - Given the source codebase,
  - When AST-parsing all TypeScript files under `src/**`,
  - Then zero `console.log` or `process.stdout.write` calls exist anywhere under `src/**`.

- **AC-MF1b-4: AST Static Metric Payload Guard** *[Tier: Unit Test]*
  - Given the source codebase under `src/**`,
  - When inspecting AST structures in `src/tools/` and `src/config.ts`,
  - Then zero hardcoded static metric data payloads (e.g., hardcoded metric result arrays) exist, confirming metric entries are derived dynamically from vendor registry files.
  - *(Note: Schema definitions and key whitelist array constants defined specifically for runtime key validation/filtering under `src/` are permitted and required by NFR-D).*

- **AC-MF1c-1: Closed Input Schema Enforcement** *[Tier: Unit Test]*
  - Given the `list_available_metrics` tool handler input parameter schema in `src/tools/list-available-metrics.ts`,
  - When inspecting the Zod input schema definition,
  - Then it explicitly enforces strict closed properties (`additionalProperties: false` / `.strict()`).

- **AC-MF1c-2: Closed Output Schema Enforcement** *[Tier: Unit Test]*
  - Given the `list_available_metrics` tool handler output schema in `src/tools/list-available-metrics.ts`,
  - When inspecting the Zod output schema definition,
  - Then both root object and array item schemas explicitly enforce strict closed properties (`additionalProperties: false` / `.strict()`).

- **AC-MF1c-3: Invalid Argument Input Rejection** *[Tier: Unit Test]*
  - Given the `list_available_metrics` tool handler,
  - When invoking the tool handler with non-empty or unexpected arguments (e.g., `{ unexpected: true }`),
  - Then the invocation is rejected with a schema validation error.

- **AC-MF2: Tool Description Boundary Verification** *[Tier: Unit Test]*
  - Given the response payload from a `tools/list` request,
  - When inspecting the `description` property of the `list_available_metrics` tool,
  - Then it contains the literal substring `"no nutrition or energy-balance data"`,
  - And it contains the literal substring `"states no cause"`.

- **AC-MF3: Stdio Protocol Integrity & Frame Isolation** *[Tier: Stdio Integration / Script]*
  - Given `node dist/server.js` is spawned as a child process over standard stdio pipes,
  - When `scripts/smoke-stdio.mjs` executes sequential RPC frames for `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`,
  - Then every non-empty line received on stdout parses strictly as valid JSON-RPC with no trailing fragments,
  - And all diagnostic, log, or debug output appears exclusively on stderr.

- **AC-MF4: Metric Entry Property & Null Guarantee** *[Tier: Unit Test]*
  - Given the `list_available_metrics` tool is called with no arguments (`{}`),
  - When the result payload is returned,
  - Then it returns one entry per registry metric,
  - And each entry contains exactly these eight keys: `key`, `source`, `metric`, `unit`, `earliestDay`, `latestDay`, `dayCount`, `gapDays`,
  - And `key`, `source`, and `metric` are populated from the vendor registries,
  - And `unit`, `earliestDay`, `latestDay`, `dayCount`, and `gapDays` are explicitly `null` (`dayCount` is `null`, never `0`).

- **AC-MF5a: Dynamic Registry Derivation** *[Tier: Unit Test]*
  - Given the metric registries defined in `src/vendor/types.ts` and `src/vendor/strain.ts`,
  - When the `list_available_metrics` tool returns its result payload,
  - Then the set of `key` values in the response equals `Object.keys(DASHBOARD_METRICS)` exactly.

- **AC-MF5b: Fallback Key Filtering** *[Tier: Unit Test]*
  - Given mock vendor definitions containing non-biometric or unknown schema keys,
  - When `DASHBOARD_METRICS` is loaded and constructed in `src/config.ts`,
  - Then `src/config.ts` filters out all non-biometric/unknown schema keys, retaining only valid biometric metric entries in the exported registry and tool output.

- **AC-MF5c: Bare/Empty Registry Fallback** *[Tier: Unit Test]*
  - Given vendor metric registries under `src/vendor/` contain zero metric definitions (`{}`),
  - When `list_available_metrics` is invoked with no arguments (`{}`),
  - Then the tool returns `"metrics": []` and populated limitation caveat strings without throwing unhandled exceptions or runtime errors.

- **AC-MF6: Caveat Derivation & Dynamic Metric Checks** *[Tier: Unit Test]*
  - Given the set of metrics passed to `src/caveats.ts`,
  - When `recovery_score` is present in the metric list,
  - Then the output caveats include an entry explicitly naming it as Whoop's proprietary score,
  - And metrics from non-Whoop sources do not trigger Whoop proprietary score caveats.

- **AC-MF7a: Mandatory Caveat String Presence** *[Tier: Unit Test]*
  - Given a response from `list_available_metrics`,
  - When inspecting the structured `caveats` array,
  - Then it is non-empty and contains entries with literal substrings `"unit"`, `"coverage"`, and `"not yet reported by this server"`.

- **AC-MF7b: Dual-Channel Emission Parity** *[Tier: Unit Test]*
  - Given a full MCP tool execution response from `list_available_metrics`,
  - When comparing the structured `caveats` array with the `content` text block array,
  - Then every caveat string in the structured array appears verbatim within the concatenated `content` text blocks.

- **AC-MF8: Strict Domain Payload Key Whitelisting** *[Tier: Unit Test]*
  - Given the key whitelist validator function exported from `src/schema-guards.ts`,
  - When evaluated against a valid domain payload (`{ metrics, caveats }`),
  - Then every key visited must exist on the explicit whitelist (`metrics`, `caveats`, `key`, `source`, `metric`, `unit`, `earliestDay`, `latestDay`, `dayCount`, `gapDays`),
  - And injecting an unwhitelisted property (e.g., `{ metrics: [], caveats: [], unexpectedKey: true }`) strictly causes the validator to fail/throw,
  - And the validation process fails if zero keys are visited.

- **AC-MF9: Vendor Files Drift Verification** *[Tier: CI Script]*
  - Given the vendored files under `src/vendor/**/*.ts` and `vendor.lock.json`,
  - When `scripts/check-vendor-drift.mjs` is executed,
  - Then each file (after stripping its 4-line provenance header) is byte-identical to the source at the commit SHA in `vendor.lock.json`,
  - And the script fails if any un-locked file exists in `src/vendor/`, printing the diverged file path and its comparison base.

---

## 8. Definition of Done

1. All unit tests (`npm test`) pass under Vitest.
2. `node scripts/smoke-stdio.mjs` executes against `dist/server.js` with exit code 0.
3. `node scripts/check-vendor-drift.mjs` exits with code 0.
4. `dist/server.js` executes smoothly without module alias resolution errors (`ERR_MODULE_NOT_FOUND`).
5. Zero database drivers, raw SQL query strings, or hardcoded measurement unit values (e.g., `"kg"`, `"lb"`, `"%"`, `"bpm"`) exist anywhere in `src/`.
6. Workspace cleanliness check: `git status --porcelain` returns empty and local git branches remain unchanged.
