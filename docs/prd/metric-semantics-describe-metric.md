# PRD: Metric Semantics & `describe_metric` (Slice 2)

> Repo: `jerkai-mcp`.
> **Authored outside the vault and outside Claude**, per DL-2026-07-31-a: this repo's PRDs
> use their own convention, not the vault house format. This document mirrors the structure
> of [[JerkAI - Build PRD - MCP Server Foundations & Metric Registry (Slice 1, shipped)]],
> the sole prior exemplar for this repo.
> **Id series:** `AC-DM1`–`AC-DM11` (new two-letter prefix, avoiding collision with the
> shipped `AC-MF` series — max allocated there is `AC-MF9`) and `NFR-E`–`NFR-F` (continuing
> this repo's lettered NFR series — max allocated is `NFR-D`). Verified by grepping both the
> vault (`Career/Projects/*.md`) and this repo's `src/`, `tests/`, `scripts/`, `docs/` — no
> `AC-DM*` or `NFR-E`/`NFR-F` exists anywhere yet.
> **Blocked on:** Slice 1 (`list_available_metrics`), shipped 2026-07-29, PR #1. No other
> dependency.

---

## 0. Definition of Ready (DoR)

Before initiating implementation of this slice, the following prerequisites must be met:

1. **Registry impact identified:** this slice reads the existing filtered registry,
   `DASHBOARD_METRICS` exported from `src/config.ts` (8 keys: `bodyFatPct`, `weight`,
   `leanBodyMass`, `dayStrain`, `recoveryScore`, `hrv`, `rhr`, `sleepDuration`, confirmed by
   reading `src/vendor/types.ts:17-29` and `src/config.ts` directly in this session). No
   re-pin of `src/vendor/` is needed and none is in scope.
2. **No database, no credential, no network transport** — this slice inherits every Slice 1
   exclusion unchanged (`AGENTS.md` §"hard constraints"; `NFR-C`).
3. **Test approach known** — Vitest unit suite (`tests/unit/`) for schema, completeness and
   role/measurement checks; the stdio smoke script (`scripts/smoke-stdio.mjs`) for anything
   a client sees over the wire, per `jerkai-mcp/docs/definition-of-ready-and-done.md` §2.

### 0.1 Confirmed decisions (session 2026-08-03) — logged as DL-2026-08-03-a1–a4

Albert confirmed the following in the session that produced this PRD, and they are now
logged: [[JerkAI - Decision Log]] DL-2026-08-03-a1 through -a4. They are stated here as
settled, not as Open Questions.

- **Role vocabulary is four values, not three** (DL-2026-08-03-a1): `north_star`, `driver`,
  `guardrail`, and a new fourth value, **`tracked`** — a metric that is ingested and shown
  (main-stack strip or otherwise) but is deliberately outside the driver tree. Introduced
  because `weight` has no driver-tree role anywhere in product docs (see next item), and
  forcing it into `guardrail` or `driver` would misstate the Product Brief.
- **Role assignment, all 8 registry keys** (DL-2026-08-03-a2; this is the completeness map
  §4/NFR-F will enforce):

  | Key | Role | Source of the role fact |
  |---|---|---|
  | `bodyFatPct` | `north_star` | Product Brief "North star & driver tree"; `docs/context.md` |
  | `dayStrain` | `driver` | Product Brief; `docs/context.md` ("Training — *driver*") |
  | `recoveryScore` | `guardrail` | Product Brief; `docs/context.md` |
  | `leanBodyMass` | `guardrail` | Product Brief; `docs/context.md` |
  | `hrv` | `guardrail` | Confirmed by Albert this session; now in the Product Brief (DL-2026-08-03-a2) |
  | `rhr` | `guardrail` | Confirmed by Albert this session; now in the Product Brief (DL-2026-08-03-a2) |
  | `sleepDuration` | `tracked` | Confirmed by Albert this session, superseding an earlier draft answer of `guardrail`; now in the Product Brief (DL-2026-08-03-a2) |
  | `weight` | `tracked` | Product Brief, formalized from "not itself a north-star, driver, or guardrail metric" (DL-2026-07-18-b) to `tracked` (DL-2026-08-03-a2) |

- **`describe_metric` is a separate tool** (DL-2026-08-03-a3), not a `role` field added to
  `list_available_metrics`'s existing response shape. Rationale carried from the pre-read
  brief: a bare enum on the existing tool, without the accompanying `limitations`, invites
  the over-reading this slice exists to prevent.
- **Unknown-key behavior** (DL-2026-08-03-a4): a `key` not present in the registry returns a
  **result-level tool error** (`isError: true`, explanatory `content`, no `structuredContent`)
  — not a protocol-level JSON-RPC error. Reasoning in §3.

`docs/context.md` in both `jerkai` and `jerkai-mcp` still under-names the driver tree at 4 of
8 keys (see §5 point 4) — flagged in DL-2026-08-03-a2 for re-snapshot in each repo's next
build PR, not resolved here.

### 0.2 Open questions still carrying a default

None block Ready. Two implementation-shape questions were deliberately **not** put to
Albert, because they are engineering choices with no product-facing consequence, not
decisions that change the slice: (a) which file holds the hand-authored semantics map, and
(b) how `schema-guards.ts`'s key whitelist extends to a second tool's distinct key set.
Both are named as reading assignments / landmines in §5, with a default named there so build
is not blocked, and both are checkable by an existing or newly-stated AC rather than by
product judgment.

---

## 1. Overview & Goal

`list_available_metrics` (Slice 1) tells a model that eight biometric axes exist. It does
not tell it that they are not co-equal. Body fat % is the north star; day strain and energy balance are drivers; recovery score and lean body mass are guardrails, and weight and sleep duration are tracked but outside that tree entirely. None of that structure currently reaches the protocol: a model handed eight flat `(source, metric)` pairs has no basis to prefer one as the outcome signal, and a model that treats a guardrail (or a merely-tracked metric) as an outcome will recommend optimizing it. This is the same over-reading `NO_CAUSE_CAVEAT` (Slice 1) exists to prevent, one level up: Slice 1 stopped a model inventing *why* metrics move; this slice stops it inventing *which one matters*.

This slice adds one tool, **`describe_metric`**, which takes a registry key and returns that
axis's role in the driver tree, whether it is measured or vendor-computed, and what it
cannot tell you. It needs no database, no credential and no network — the semantics are
product truth, not data, exactly as Slice 1's registry facts were.

**Primary goals:**

1. Driver-tree roles reach the protocol, sourced from the Product Brief / `docs/context.md`
   and this PRD's §0.1 table, not restated ad hoc by the build.
2. Measured vs. vendor-computed becomes a per-metric, queryable property of every axis,
   derived from the same fact that already drives Slice 1's Whoop-proprietary caveat
   (`src/caveats.ts`), not a second hand-maintained list (NFR-E).
3. Registry completeness is enforced, not assumed: every key in `DASHBOARD_METRICS` must
   carry semantics or an automated test fails (NFR-F).
4. The honesty contract holds: no coverage, no cause, and no derived value reported as
   measured. Anything this server does not observe stays absent or explicitly caveated.

---

## 2. What this slice is NOT

- **NO database, credential, or network transport.** All Slice 1 exclusions carry forward
  unchanged, including the AST and dependency guards that enforce them (`AC-MF1b-1`,
  `AC-MF1b-2`, `NFR-C`).
- **NO coverage fields.** `describe_metric` reports no unit, date range, day count or gap.
  A metric's meaning is knowable without data; its coverage is not. (Same exclusion as
  Slice 1 — this slice does not touch `unit`/`earliestDay`/`latestDay`/`dayCount`/`gapDays`
  at all.)
- **NO causal or prescriptive content.** A role says where an axis sits in the tree. It
  never says what to do about it, and never asserts that one metric moved another.
- **NO nutrition or energy-balance data**, and no registry key for it — `describe_metric`
  cannot be asked about a metric this server was never given, and its own description says
  so (§3, boundary phrases carried from Slice 1).
- **NOT a change to `list_available_metrics`'s existing response shape or behavior.** That
  tool's output schema, caveats and tests are untouched by this slice.
- **NOT a resolution of the registry-publishing question.** Vendoring stays as-is; the
  trigger for revisiting it is data access, not this slice.
- **NOT a review or change of `.github/workflows/vendor-drift.yml`'s cadence or its
  "cannot detect upstream drift" limitation** (`AGENTS.md` §Traps; `FM-07` occurrence 2).
  That is unrelated to metric semantics and is explicitly deferred as its own,
  separately-scoped fast-follow if Albert wants it picked up — not bundled here.
- **NOT a fifth role or a third measurement value.** `north_star` / `driver` / `guardrail` /
  `tracked`, and `measured` / `vendor_computed`, are closed enumerations for this slice.
  Adding a value later is itself a product decision requiring its own Decision Log entry,
  not a silent extension.

---

## 3. Tool contract

**Tool: `describe_metric`**

- **Input:** `{ key: string }` — a key from `list_available_metrics`'s response (i.e. a key
  of `DASHBOARD_METRICS`). Closed schema: `z.object({ key: z.string().min(1) }).strict()`
  (NFR-A). An empty string is rejected by the schema, not treated as a valid-but-unknown key.
- **Output, success case** (closed at root — no nested array-of-objects, so no separate
  item-level `.strict()` is needed the way `list_available_metrics`'s `metrics[]` needed
  one):

  ```json
  {
    "source": "string",
    "metric": "string",
    "role": "north_star | driver | guardrail | tracked",
    "measurement": "measured | vendor_computed",
    "description": "string",
    "limitations": ["string"],
    "caveats": ["string"]
  }
  ```

  - `role` and `measurement` are `z.enum(...)`, not bare strings — closed vocabularies, not
    free text (stronger than the minimum NFR-A requires, and cheaper to keep closed now than
    to retrofit later).
  - `caveats` carries the same three global boundary statements `list_available_metrics`
    already derives (`COVERAGE_CAVEAT`, `NO_NUTRITION_CAVEAT`, `NO_CAUSE_CAVEAT` from
    `src/caveats.ts`), reused verbatim — not re-authored a second time in a second module.
  - `limitations` carries **metric-specific** facts:
    - For a `measurement: "vendor_computed"` metric, `limitations` includes the existing
      Whoop-proprietary text for that metric from `WHOOP_PROPRIETARY_SCORES`
      (`src/caveats.ts:20-25`) verbatim — reused, not restated (NFR-E; AC-DM9).
    - For a `role: "tracked"` metric, `limitations` includes an entry containing the literal
      substring `"not part of the driver tree"` (AC-DM10) — the same contractual-substring
      pattern Slice 1 used for its two mandatory description phrases (AC-MF2), applied here
      to a per-metric fact instead of a tool-wide one.
    - For `north_star` / `driver` / `guardrail` roles with no vendor-computed or tracked
      fact to add, `limitations` may be empty.
- **Output, unknown-key case:** a normal MCP tool result with `isError: true`, a `content`
  text block naming the literal invalid key and pointing at `list_available_metrics` for the
  valid set, and **no** `structuredContent` — never an empty or inferred description.
  **Verified against the installed SDK, not assumed** (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:100-198`
  — no separate SDK doc covers tool error handling, so the shipped source is the authoritative
  artifact, per the same standard `AGENTS.md` sets for framework claims):
  `McpServer`'s own `CallToolRequestSchema` handler wraps the *entire* handler invocation,
  including input-schema validation, in one `try`/`catch` (lines 100–142); any thrown error
  — a hand-thrown `Error`, or the `McpError` that `validateToolInput` throws on a schema
  mismatch — is caught and converted to `{ content: [...], isError: true }` via
  `createToolError` (lines 152–161), **not** surfaced as a top-level JSON-RPC `error` object,
  except for the single unrelated `UrlElicitationRequired` case (line 137). `validateToolOutput`
  additionally **skips output-schema validation entirely when `result.isError` is true** (line
  193–195), which is exactly why this response can safely omit `structuredContent` without
  tripping `OutputSchema.strict()`. Net effect: at this SDK version, a genuine protocol-level
  error was never the live alternative for this repo's error paths — Slice 1's smoke script
  tolerating either shape (`scripts/smoke-stdio.mjs:149-153`) was hedging against something
  this SDK doesn't actually do. The product decision that remains Albert's (confirmed §0.1) is
  that this must be a **discoverable, explicit** error — not which transport-level shape carries
  it, which the SDK has already settled.
- **Description:** `TOOL_DESCRIPTION` for `describe_metric` must contain, verbatim, the same
  two mandatory phrases Slice 1 requires of `list_available_metrics` — `"no nutrition or
  energy-balance data"` and `"states no cause"` (AC-DM7) — for the same reason DL-2026-07-27-a4
  gives: a boundary belongs in the description, read before the model decides to call the
  tool, not only in the payload it gets back.

---

## 4. Architecture & required reading

**Required reading before touching anything** (each file's relevant fact, verified in this
session, not carried over from an older doc):

- `src/config.ts` (58 lines, read in full) — `DASHBOARD_METRICS` is the **filtered**
  registry (via `isMetricDefinition`/`buildMetricRegistry`), 8 keys. `AGENTS.md`'s own trap
  names a second, unfiltered `DASHBOARD_METRICS` symbol exported from
  `src/vendor/types.ts` — **import the config one**, exactly as
  `src/tools/list-available-metrics.ts:4` already does.
- `src/caveats.ts` (61 lines, read in full) — `WHOOP_PROPRIETARY_SCORES` (lines 20–25) is a
  **module-private** `const`, not exported. It is the only existing source of "which metrics
  are vendor-computed," and NFR-E requires this slice to derive `measurement` from it rather
  than hand-write a second list. Since it is not exported today, the build must decide how to
  share it (export the const itself, or export a small accessor) — a mechanical choice, not
  specified here, but the two-sources-of-truth failure it exists to avoid is exactly `FM-07`'s
  pattern (occurrence 2 was in this same repo, in this same file's surrounding prose).
  `COVERAGE_CAVEAT`, `NO_NUTRITION_CAVEAT`, `NO_CAUSE_CAVEAT` (lines 29–36) are already
  exported and are what §3's `caveats` field reuses.
- `src/schema-guards.ts` (78 lines, read in full) — `DOMAIN_KEY_WHITELIST` (lines 14–25) is a
  **single flat set**, currently sized exactly to `list_available_metrics`'s payload shape.
  It is not tool-scoped: nothing in `assertDomainKeys` ties a key to which tool's payload it
  came from. Adding `describe_metric`'s keys (`role`, `measurement`, `description`,
  `limitations`) to the same flat set would make the validator pass a payload that mixed
  fields from both tools, which is a weaker guarantee than NFR-D intends. Decide, before
  writing `describe_metric`'s handler, whether this needs a second whitelist/walker pair or a
  tool-scoped variant of the existing one — read the whole file first; it is short.
- `src/tools/list-available-metrics.ts` (118 lines, read in full) — the structural template
  this slice's new tool file should follow (`TOOL_NAME`, `TOOL_DESCRIPTION`, `InputSchema`,
  `OutputSchema`, a `build*` function, a `handle*` function, `toolConfig`). Also the source of
  the args-discarding trap below.
- `src/server.ts` (39 lines, read in full) — line 22 registers the existing tool as
  `server.registerTool(TOOL_NAME, toolConfig, () => handleListAvailableMetrics({}))`. That
  arrow function **discards whatever arguments the client actually sent** and always calls the
  handler with `{}`. **Verified this is a real, not hypothetical, discard** by reading the
  SDK's own dispatch: `McpServer.executeToolHandler`
  (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:230-233`) calls the
  registered callback as `typedHandler(args, extra)` whenever the tool has an `inputSchema` —
  the validated client arguments are the callback's first parameter. `server.ts`'s callback is
  a zero-parameter arrow function, so it never reads that first parameter at all. This is
  harmless today only because `list_available_metrics` takes no arguments. `describe_metric`
  does take one (`key`), so registering it with the same discard-and-hardcode pattern would
  silently break every call: the handler would always see `{}`, `key` would always be
  `undefined`, and the client-supplied key would never reach it. **Read this line before
  registering the second tool** — the fix is to thread the real arguments through, and AC-DM1
  (tier: stdio smoke) is the test that would have caught this had it shipped wrong, because a
  unit test calling the handler function directly with a hand-built `{ key }` object cannot see
  a registration-layer bug at all.
- `src/vendor/types.ts` (41 lines, read in full) — confirms the exact 8 keys and their raw
  `(source, metric)` pairs (lines 17–29); the source this PRD's §0.1 role table maps onto.
- `scripts/smoke-stdio.mjs` (171 lines, read in full) — the harness AC-DM1 and AC-DM6 extend;
  today it drives exactly one tool's handshake and one bad-argument case (lines 144–153).
- `jerkai-mcp/docs/definition-of-ready-and-done.md` — this repo's test-tier mapping (§2): a
  unit test satisfies a Vitest-reachable AC; anything about what a client sees on `tools/list`
  or `tools/call` needs the smoke script.

**New files** (exact names are the build's choice, not prescribed; the constraints below are
not):

- A hand-authored metric-semantics module living **outside** `src/tools/` and outside
  `src/config.ts` — both are in `AC-MF1b-4`'s inspected scope (`tests/unit/schema-guards.test.ts:124-126`),
  whose AST guard already rejects any object literal carrying a `source`/`metric` string-literal
  key pair in either location. `src/caveats.ts` is the existing precedent for a sibling module
  outside that scope holding a hand-authored, per-metric-name map (`WHOOP_PROPRIETARY_SCORES`)
  — model the new module's location on that precedent, not its exact shape.
- The `describe_metric` tool file, structured like `src/tools/list-available-metrics.ts`.
- Corresponding `tests/unit/*.test.ts` file(s) — split however the build prefers, as long as
  every AC in §7 is covered.

**Files this slice modifies:** `src/server.ts` (registration), `src/caveats.ts` (export
`WHOOP_PROPRIETARY_SCORES` or an accessor for it), `src/schema-guards.ts` (whitelist
mechanism for a second tool), `scripts/smoke-stdio.mjs` (extend), `tests/unit/schema-guards.test.ts`
(if the whitelist mechanism changes its exported shape), `README.md` (document the new tool
alongside `list_available_metrics`, matching its existing style).

**Ordered path a `describe_metric` call takes** (FM-06 — stated in full since it spans four
files):

1. `src/server.ts` — `McpServer` receives the `tools/call` frame and dispatches to the
   registered handler, **passing the client's actual arguments through** (see trap above).
2. The new tool file's handler — validates `{ key }` against `InputSchema`, looks the key up
   in the semantics module.
3. On an unknown key: the handler returns the `isError: true` shape directly (§3) and does
   not reach step 4.
4. On a known key: the handler reads the metric's `role` from the semantics module, derives
   `measurement` from `src/caveats.ts`'s `WHOOP_PROPRIETARY_SCORES` (NFR-E), assembles
   `{ source, metric, role, measurement, description, limitations, caveats }`, passes it
   through `schema-guards.ts`'s whitelist walker, validates it against `OutputSchema`, and
   emits it on both channels (`content` text + `structuredContent`), mirroring
   `list-available-metrics.ts:93-104`.

---

## 5. Technical risks & implementation pitfalls

1. **The AST guard does not cover this module's shape — placement is convention, not
   enforcement.** `AC-MF1b-4` (already shipped) rejects an object literal only when it
   carries a property literally named `source` or `metric`, under `src/tools/` or
   `src/config.ts` (`tests/unit/schema-guards.test.ts:124-147`). The semantics module this
   slice adds is keyed by `role`/`measurement`/`description`/`limitations` — that shape will
   never trip the guard, regardless of where the file lives. §4's "New files" note names the
   precedent to follow anyway (`src/caveats.ts`'s location, not its shape), but nothing
   mechanical enforces it landing there (FM-07).
2. **Semantics are hand-authored, so they are a new drift surface.** Unlike the registry
   itself, they cannot be vendored — they are prose derived from the Product Brief and
   `docs/context.md`, both vault-sourced. Nothing mechanical catches this prose going stale
   against a future driver-tree change; only NFR-F's completeness test catches a *key*
   appearing or disappearing, never a role becoming wrong for a key that still exists. Any
   PR that changes a role's wording is itself a product-truth change under the baseline DoD's
   reconciliation-flag item.
3. **The completeness test converts silent staleness into a loud failure — take it.** Assert
   the semantics module's key set equals `Object.keys(DASHBOARD_METRICS)` (the `config.ts`
   export) exactly, in both directions. A new axis appearing in a re-pinned vendor registry
   then breaks the build instead of `describe_metric` returning nothing for it (NFR-F,
   AC-DM4).
4. **`docs/context.md`'s driver tree is itself incomplete against the registry.** It names
   `bodyFatPct`, `dayStrain`, `recoveryScore`, `leanBodyMass` — 4 of 8 keys — and says
   nothing about `weight`, `hrv`, `rhr`, or `sleepDuration`. This PRD's §0.1 table is the
   first place all 8 are assigned a role; `docs/context.md` was not treated as a complete
   source and should not be, until it is reconciled (see this PRD's cover report).
5. **Two sources of truth for "vendor-computed" is the exact shape of `FM-07`'s second
   occurrence, in this same file.** `WHOOP_PROPRIETARY_SCORES` already exists and already
   drives Slice 1's Whoop-proprietary caveat. Writing a second, independently-maintained list
   to decide `describe_metric`'s `measurement` field would let the two disagree with nothing
   to catch it. NFR-E requires one list, not two, whatever the sharing mechanism (see §4's
   note that the const is currently unexported).
6. **`schema-guards.ts`'s whitelist is not tool-scoped today.** See §4. Resolve before the
   handler is built, since `assertDomainKeys` is called once per tool and its guarantee
   (NFR-D) is only as strong as whether a payload's keys can be attributed to the *right*
   tool's contract.
7. **The registration-layer argument-discarding pattern is a landmine for exactly this
   slice.** See §4's `src/server.ts` note. This is the slice's FM-02-class bare/entry-case
   risk: nothing about it is visible to a unit test that calls the handler function directly
   with a hand-built argument object, because that bypasses the registration layer entirely.
   AC-DM1 is the load-bearing test and must run against the real registered server (stdio
   smoke), not the handler in isolation.

---

## 6. Non-Functional Requirements (NFRs)

- **NFR-E (Single source for vendor-computed classification):** A metric is
  `measurement: "vendor_computed"` if and only if it appears in `src/caveats.ts`'s
  `WHOOP_PROPRIETARY_SCORES`; every other registry metric is `"measured"`. This is a
  property — the classification is derived from that one existing list, by construction,
  never a second hand-maintained enumeration of vendor-computed metric names. Guards against
  a third occurrence of `FM-07`'s pattern in this repo.
- **NFR-F (Registry completeness is enforced, not assumed):** The metric-semantics module's
  key set must equal `Object.keys(DASHBOARD_METRICS)` from `src/config.ts` exactly. An
  automated test fails loudly on any mismatch in either direction — a registry key with no
  semantics entry, or a semantics entry with no matching registry key — never silently
  (returning `undefined` semantics, or ignoring an orphaned entry).

`NFR-A` (closed schemas), `NFR-B` (clean stdout), `NFR-C` (dependency constraints), and
`NFR-D` (payload whitelisting) all carry forward unchanged from Slice 1 and apply to this
slice's new files without restatement; §7 names which ACs exercise each against the new code.

---

## 7. Acceptance Criteria & Test Tiering Matrix

- **AC-DM1: Protocol registration & argument threading** *[Tier: Stdio Integration / Script]*
  **— load-bearing test for this slice.**
  - Given the MCP server running over stdio with both tools registered,
  - When a client requests `tools/list`,
  - Then the response lists exactly two tools, including `describe_metric`;
  - And when the client calls `tools/call` for `describe_metric` with a real argument object
    (e.g. `{ key: "bodyFatPct" }`),
  - Then the returned `structuredContent.source` and `.metric` match `bodyFatPct`'s actual
    `(source, metric)` pair — proving the client's argument reached the handler rather than
    being discarded at registration (§4, §5.7).

- **AC-DM2: Closed input schema** *[Tier: Unit Test]*
  - Given `describe_metric`'s input schema,
  - When inspecting its definition,
  - Then it is `.strict()` / `additionalProperties: false`,
  - And it rejects a missing `key`, an empty-string `key`, and any extra property.

- **AC-DM3: Closed output schema (success shape)** *[Tier: Unit Test]*
  - Given `describe_metric`'s output schema,
  - When inspecting its definition,
  - Then the root object is `.strict()`,
  - And `role` and `measurement` are declared as closed enums, not bare strings.

- **AC-DM4: Registry completeness guard** *[Tier: Unit Test]*
  - Given the metric-semantics module and `DASHBOARD_METRICS` from `src/config.ts`,
  - When their key sets are compared,
  - Then they are exactly equal, and the test names any missing or extra key on failure.

- **AC-DM5: Role and measurement correctness, every registry key** *[Tier: Unit Test]*
  - Given each of the 8 registry keys,
  - When `describe_metric` is called for each in turn,
  - Then the `role`/`measurement` pairs are exactly: `bodyFatPct` → `north_star`/`measured`;
    `dayStrain` → `driver`/`vendor_computed`; `recoveryScore` → `guardrail`/`vendor_computed`;
    `leanBodyMass` → `guardrail`/`measured`; `hrv` → `guardrail`/`measured`; `rhr` →
    `guardrail`/`measured`; `sleepDuration` → `tracked`/`measured`; `weight` →
    `tracked`/`measured` (per §0.1's table) —
  - And this single table-driven test is what exercises all four `role` values and both
    `measurement` values at least once each (FM-02).

- **AC-DM6: Unknown key** *[Tier: Unit Test + Stdio Smoke]*
  - Given a `key` not present in the registry (e.g. `"not_a_real_key"`),
  - When `describe_metric` is called with it,
  - Then the result has `isError: true`, no `structuredContent`, and a `content` text block
    containing the literal invalid key and the string `"list_available_metrics"`;
  - And this is not a thrown protocol-level JSON-RPC error (verified over the real stdio
    handshake, not only against the handler function).

- **AC-DM7: Mandatory boundary phrases in the tool description** *[Tier: Unit Test]*
  - Given `describe_metric`'s registered `description`,
  - When inspecting it,
  - Then it contains, verbatim, `"no nutrition or energy-balance data"` and `"states no
    cause"`.

- **AC-DM8: Dual-channel parity for a valid key** *[Tier: Unit Test]*
  - Given a full tool response for a known key,
  - When comparing `structuredContent`'s `caveats` and `limitations` against the `content`
    text blocks,
  - Then every string in both arrays appears verbatim in the concatenated text.

- **AC-DM9: Vendor-computed limitations reuse the existing text** *[Tier: Unit Test]*
  - Given a `measurement: "vendor_computed"` metric (`dayStrain` or `recoveryScore`),
  - When its `limitations` are inspected,
  - Then they include the exact string from `src/caveats.ts`'s `WHOOP_PROPRIETARY_SCORES`
    for that metric — not a re-authored paraphrase (NFR-E).

- **AC-DM10: Tracked-role limitations state the exclusion** *[Tier: Unit Test]*
  - Given a `role: "tracked"` metric (`weight` or `sleepDuration`),
  - When its `limitations` are inspected,
  - Then they include an entry containing the literal substring `"not part of the driver
    tree"`.

- **AC-DM11: Strict domain payload key whitelisting for `describe_metric`** *[Tier: Unit Test]*
  - Given the whitelist/walker mechanism serving `describe_metric`'s payload (§4, §5.6),
  - When evaluated against a valid response payload,
  - Then every visited key is on that tool's whitelist;
  - And injecting an unwhitelisted property causes it to throw;
  - And a payload built by concatenating `describe_metric`'s keys with
    `list_available_metrics`'s keys is **not** silently accepted as valid for either tool
    (proving the mechanism is tool-scoped, per NFR-D, and closing the §5.6 landmine).

**Coverage:** every AC above is covered exactly once. `NFR-A` ← AC-DM2, AC-DM3. `NFR-B`/`NFR-C`
← inherited automatically (the existing AST guards scan all of `src/`, including new files,
with no new AC needed). `NFR-D` ← AC-DM11. `NFR-E` ← AC-DM9. `NFR-F` ← AC-DM4.

---

## 8. Definition of Done

Feature-specific, in addition to the baseline:

1. All 11 ACs above pass under `npm test` (Vitest) and `npm run smoke` (stdio), as tiered.
   `NFR-E` (single source for vendor-computed classification) is satisfied by AC-DM9 passing;
   `NFR-F` (registry completeness enforced) is satisfied by AC-DM4 passing;
   `NFR-A`/`NFR-D` are satisfied by AC-DM2/AC-DM3/AC-DM11 passing; `NFR-B`/`NFR-C` are
   satisfied by the existing, unmodified AST guards (`AC-MF1b-2`, `AC-MF1b-3`) passing
   against the new files.
2. `npm run vendor:check` still exits 0 — this slice does not touch `src/vendor/`.
3. `README.md` documents `describe_metric` alongside `list_available_metrics` (contract,
   example response, the `isError` shape for an unknown key).
4. **Product-truth reconciliation flagged in the PR** (baseline DoD item, sharpened here):
   name explicitly that (a) the role vocabulary (`north_star`/`driver`/`guardrail`/`tracked`)
   and the 8-key role table in this PRD's §0.1 are logged as DL-2026-08-03-a1/-a2 and now
   reflected in the Product Brief, and (b) `docs/context.md`'s driver tree section in both
   `jerkai` and `jerkai-mcp` still under-names the registry (4 of 8 keys) and needs
   re-snapshotting in this slice's PR (or a fast-follow) to match.
5. Workspace cleanliness: `git status --porcelain` empty, no stray local branches.

Plus the baseline DoD — see `docs/definition-of-ready-and-done.md`.
