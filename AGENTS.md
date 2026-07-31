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
- **No database driver, ORM, credential or SQL** — not in `package.json`, not in any
  import under `src/`. Slice 1 has no database by design; adding one is a scope change
  needing its own PRD, not a config change.
  *Enforced by:* `tests/unit/schema-guards.test.ts` → "AC-MF1b-1" (dependency list),
  "AC-MF1b-2" (AST import walk) and "DoD 5: no hardcoded unit values or SQL under src/".
- **Input and output schemas are closed** (`z.object({...}).strict()`), at the root and at
  the array item. The runtime key whitelist in `src/schema-guards.ts` is the second gate.
  *Enforced by:* `tests/unit/schema-guards.test.ts` → "AC-MF1c-1", "AC-MF1c-2" and
  "AC-MF8", plus the `inputSchema.additionalProperties === false` check in
  `scripts/smoke-stdio.mjs`.

`npm test` runs the Vitest unit suite including all of the above. `npm run smoke` drives a
real stdio handshake against `dist/server.js` and needs `npm run build` first.
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
- **`dayCount` is `null`, never `0`.** This is semantic, not a placeholder awaiting a real
  value. A zero asserts "we looked and found nothing"; this server never looked. The same
  reasoning governs `unit`, `earliestDay`, `latestDay` and `gapDays`. Do not "improve" a
  null into a default — `MetricEntrySchema` types these as `z.null()` and
  `tests/unit/schema-guards.test.ts` rejects `dayCount: 0` explicitly.
- **The vendor drift check cannot detect upstream change.** It compares against the
  immutable SHA in `vendor.lock.json`, so it catches local edits to `src/vendor/` and
  nothing else. A registry change in jerkai leaves this repo green and stale. Picking one
  up is a deliberate step, never automatic.
