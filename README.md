# jerkai-mcp

A local, read-only [Model Context Protocol](https://modelcontextprotocol.io) server that
tells a model which JerkAI biometric axes exist, where they come from, and what this
server cannot answer.

It exposes two tools, `list_available_metrics` and `describe_metric`. Neither touches a
database, holds credentials, or reports a real reading. Every coverage field comes back
`null` on purpose: the shape is final, the data is not wired up yet.

## Quick start

```bash
npm install && npm run build && node dist/server.js
```

The server speaks JSON-RPC over stdio. `stdout` carries protocol frames and nothing else;
all diagnostics go to `stderr`.

### Register it with an MCP client

```json
{
  "mcpServers": {
    "jerkai": {
      "command": "node",
      "args": ["/absolute/path/to/jerkai-mcp/dist/server.js"]
    }
  }
}
```

## The tools

### `list_available_metrics`

Takes no arguments (the input schema is closed: any property is a validation error) and
returns:

```json
{
  "metrics": [
    {
      "key": "recoveryScore",
      "source": "whoop",
      "metric": "recovery_score",
      "unit": null,
      "earliestDay": null,
      "latestDay": null,
      "dayCount": null,
      "gapDays": null
    }
  ],
  "caveats": ["..."]
}
```

`dayCount` is `null`, never `0`. A zero would read as "we looked and found nothing"; this
server never looked.

The `caveats` array is the point of the tool as much as the metric list is. It always
states that unit and coverage are not yet reported, that there is no nutrition or
energy-balance data here, and that co-movement between metrics states no cause. Whoop's
proprietary composites (`recovery_score`, `day_strain`) get named as such when present.
Every caveat is emitted twice, once in `structuredContent` and once verbatim in the text
content blocks, so a client that ignores structured output still sees them.

### `describe_metric`

Takes one required argument, `key` (a key from `list_available_metrics`'s response), and
returns that axis's role in the driver tree, whether it is measured or vendor-computed, and
what it cannot tell you:

```json
{
  "source": "whoop",
  "metric": "recovery_score",
  "role": "guardrail",
  "measurement": "vendor_computed",
  "description": "Whoop's Recovery Score: a guardrail metric summarizing how ready the body is to take on strain.",
  "limitations": [
    "recovery_score is Whoop's proprietary Recovery Score, a vendor-computed composite rather than a directly measured quantity. Its inputs and scale are Whoop's own and are not reproducible from the other metrics here."
  ],
  "caveats": ["..."]
}
```

`role` is one of `north_star`, `driver`, `guardrail` or `tracked` — `tracked` means the
metric is ingested and shown but deliberately outside the driver tree (`weight` and
`sleepDuration` today). `measurement` is `measured` or `vendor_computed`, derived from the
same fact that drives `list_available_metrics`'s Whoop-proprietary caveat, never a second
hand-maintained list. `caveats` repeats the same three global boundary statements
`list_available_metrics` carries; `limitations` carries metric-specific facts instead — the
vendor-computed text verbatim for a Whoop composite, and an explicit "not part of the driver
tree" statement for a `tracked` metric.

A `key` not present in the registry returns a result-level tool error
(`isError: true`, an explanatory `content` block naming the invalid key and pointing at
`list_available_metrics`, and no `structuredContent`) — never a protocol-level JSON-RPC
error and never an empty or inferred description.

## What this repo is not

No database drivers, no ORM, no SQL, no credentials, no HTTP or SSE transport, no prompts,
no resources, no writes. The dependency and import guards in
[`tests/unit/schema-guards.test.ts`](tests/unit/schema-guards.test.ts) enforce all of that
by AST-parsing everything under `src/`, so the boundary fails CI rather than eroding.

## Vendored registry

`src/vendor/types.ts` and `src/vendor/strain.ts` are byte-pinned copies of
`lib/dashboard/types.ts` and `lib/dashboard/strain.ts` from
[albimartai/jerkai](https://github.com/albimartai/jerkai), at the commit recorded in
[`vendor.lock.json`](vendor.lock.json). Each carries a four-line provenance header and is
otherwise untouched, including its upstream `@/lib/dashboard/*` import (mapped through
`tsconfig` paths and bundled by tsup).

Do not edit them. To pick up an upstream change, re-copy the files, bump the `sha` in the
lock, and re-run the drift check:

```bash
JERKAI_REPO=../jerkai node scripts/check-vendor-drift.mjs
```

The check compares against a local jerkai checkout (`JERKAI_REPO`, default `../jerkai`),
so it works offline. It resolves the upstream bytes with `git show <locked-sha>:<path>`,
where the SHA is the one in `vendor.lock.json` — never the checkout's current `main`. So it
catches edits to `src/vendor/` and nothing else: a change to `lib/dashboard` upstream leaves
this repo green and serving a stale registry. Picking one up is the deliberate step above.
The `Vendor drift` workflow runs the same comparison against the same frozen commit on every
push, on every PR and on a weekly cron, so it does not — and as currently written cannot —
alert on upstream drift.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Vitest unit suite, including the dependency/AST/schema guards |
| `npm run build` | tsup bundles `src/server.ts` into a single `dist/server.js` |
| `npm run smoke` | Spawns the built server and drives a real stdio handshake |
| `npm run vendor:check` | Verifies the vendored files against the locked commit |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |

`npm run smoke` needs `npm run build` first.
