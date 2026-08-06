# jerkai-mcp — hard constraints

Four rules. Each is enforced by a test or script, so breaking one fails the suite, not review.

- **Never edit `src/vendor/*.ts`.** They are byte-pinned copies of jerkai's
  `lib/dashboard/types.ts` and `lib/dashboard/strain.ts` at the commit in
  `vendor.lock.json`, each behind a four-line `//` provenance header. No reformatting, no
  import fixes, no lint fixes. To take an upstream change: re-copy both files, bump `sha`
  in the lock, re-run `scripts/check-vendor-drift.mjs`.
  *Enforced by:* `scripts/check-vendor-drift.mjs` (header strip + byte compare) and
  `tests/unit/vendor-drift.test.ts`.
- **stdout carries JSON-RPC frames only.** Every diagnostic goes to stderr via
  `console.error`. No `console.log`, no `process.stdout.write`, anywhere under `src/`.
  *Enforced by:* `tests/unit/schema-guards.test.ts` → "AC-MF1b-3: no stdout writes under
  src/" (AST walk), plus the `no-console` / `no-restricted-properties` rules in
  `eslint.config.mjs`, plus the stderr checks in `scripts/smoke-stdio.mjs`.
- **No database driver, ORM, credential or SQL beyond one named exception.** Slice 1 had no
  database by design; "Coverage Values over Read-Only Postgres" (2026-08-06) is the scope
  change that narrows this constraint, not a config change around it. The exception is
  exactly `@neondatabase/serverless`, imported from `src/db.ts` alone, reading exactly one
  credential (`MCP_DATABASE_URL`, a read-only role) and running exactly one query (a grouped
  `SELECT` over `biometric_readings`, scoped to this server's own registered metrics). No
  ORM, no ad hoc SQL beyond that one query, no write statement, no second credential, no
  table beyond the one queried. Any new driver, credential, table or write path is a scope
  change needing its own PRD, same as before.
  *Enforced by:* `tests/unit/schema-guards.test.ts` → "AC-MF1b-1" (dependency list, narrowed
  to admit `@neondatabase/serverless`), "AC-MF1b-2" (AST import walk, scoped to `src/db.ts`)
  and "DoD 5: no hardcoded unit values or SQL write-statement strings under src/" (narrowed
  to admit `SELECT`); `tests/unit/coverage.test.ts` → "AC-CV6" (no write keyword in
  `src/db.ts`'s own query text) and "AC-CV12" (the narrowed guards re-exercised directly).
- **Input and output schemas are closed** (`z.object({...}).strict()`), at the root and at
  the array item. The runtime key whitelist in `src/schema-guards.ts` is the second gate.
  *Enforced by:* `tests/unit/schema-guards.test.ts` → "AC-MF1c-1", "AC-MF1c-2" and
  "AC-MF8", plus the `inputSchema.additionalProperties === false` check in
  `scripts/smoke-stdio.mjs`.

`npm test` runs both Vitest projects: the unit suite (including all of the above, DB-free)
and the disposable-Neon-branch integration project, which needs `MCP_DATABASE_URL`. `npm
run smoke` drives a real stdio handshake against `dist/server.js`, also needs
`MCP_DATABASE_URL` since it now asserts on real coverage, and needs `npm run build` first.
`npm run vendor:check` runs the drift script alone. See README's Scripts table.

## Traps

- **`src/vendor/types.ts` imports `@/lib/dashboard/strain`.** That alias is jerkai's, not
  this repo's, and it looks like a broken import. It is not: `tsconfig.json` maps
  `@/lib/dashboard/*` to `./src/vendor/*`, `vitest.config.ts` mirrors it, and tsup bundles
  it away. Rewriting it to a relative path breaks the byte-pin and fails the drift check —
  the vendored file must stay byte-identical to upstream, including imports that only make
  sense upstream.
- **There are two `DASHBOARD_METRICS` symbols.** The raw one from `src/vendor/types.ts`,
  and the filtered one from `src/config.ts`. Only the config one has been through
  `isMetricDefinition`, which drops anything that is not exactly a populated
  `{ source, metric }` pair. Both imports compile and both look right; importing the vendor
  one directly silently defeats the filter and AC-MF5b with it. Import from
  `src/config.ts` unless you have a specific reason not to.
- **`dayCount: 0` and `dayCount: null` mean opposite things — do not conflate them.** `0`
  asserts "the coverage query ran and found nothing," a real answer for a metric registered
  before its first sync ever ran. `null` asserts "no query ran to completion" — an unset
  `MCP_DATABASE_URL`, a connection failure — or, for `unit` alone, that the rows recorded
  zero or more than one distinct unit. Never substitute one for the other via a `??`
  fallback; `deriveCoverage` (`src/tools/list-available-metrics.ts`) is the one place this
  distinction is computed, and `tests/unit/coverage.test.ts` (AC-CV2a, AC-CV3) pins both
  directions explicitly.
- **The vendor drift check cannot detect upstream change.** It compares against the
  immutable SHA in `vendor.lock.json`, so it catches local edits to `src/vendor/` and
  nothing else. A registry change in jerkai leaves this repo green and stale. Picking one
  up is a deliberate step, never automatic.
