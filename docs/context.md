# JerkAI MCP — Product Context (for build sessions)

Reading protocol: **the Build PRD in `docs/prd/` is the spec of record** for the slice
being built; **`README.md` is tool-contract and script truth**; **`AGENTS.md` is the
enforced-constraint list**; **this file is durable product context**. Product truth for
JerkAI as a whole lives in the sibling repo at `../jerkai/docs/context.md`, snapshotted
there from a Career vault that is not version-controlled and is not in either checkout.
Where this file and that one disagree about the product, that one wins.

## What JerkAI is

A single-user personal health dashboard that turns a noisy daily body-fat reading into a
trustworthy trend and, when the trend stalls, makes it fast to see which driver explains
it. Also a public-built FDE portfolio artifact. No real biometric data is ever exposed
publicly — the public demo uses synthetic data, and that rule reaches this repo too: this
server holds no data and must never be given real readings to serve.

## North star and driver tree

North star: **body fat % trend** (7-day and 30-day rolling average) as the decision
signal. The **raw daily reading is always shown alongside it, never hidden or replaced**.
Raw is the record of truth; the trend is only the lens for deciding whether anything
changed.

Around it:

- **Energy balance** — *driver* — calories and macros against a target, from manual meal
  logging in the app. **This server has none of it.**
- **Training** — *driver* — Whoop Day Strain (Cycle Strain, 0–21), from the Whoop API.
  Not workout-log tonnage, which is permanently not a dashboard metric.
- **Recovery Score** — *guardrail* — Whoop's own proprietary composite.
- **Lean body mass** — *guardrail* — from Fitdays via Apple Health.

The metric axes this server names are the same `(source, metric)` pairs the dashboard
renders, read from the vendored registry rather than restated. See `src/config.ts`.

## The raw-data-preserved principle

Raw values are stored and shown; trends and derivations are computed at read time and
never overwrite a raw record. Its form here: **never report a derived or assumed value as
if it were measured, and prefer an explicit null over a plausible guess.** That is exactly
why `dayCount` comes back `null` and never `0` — see `AGENTS.md` § Traps.

## What this repo is

A local, read-only Model Context Protocol server over stdio, sitting on the same metric
registry as the dashboard. It is a third product surface, built and shipped independently
of the app: it lets an MCP-connected chat client ask about JerkAI's data. It holds no
credential, opens no database connection, and has no network transport.

The shipped slice (2026-07-29) answers exactly one question, through one tool,
`list_available_metrics`: **which biometric axes are queryable, and from which source
system.** Everything about coverage — unit, date range, day counts, gaps — comes back
`null`, because this server has no data access at all. The shape is final; the data is not
wired up. Slice 1's spec is `docs/prd/mcp-server-foundations-metric-registry.md`; the
response contract itself is in README.

## The two boundaries the tool description must carry

`TOOL_DESCRIPTION` in `src/tools/list-available-metrics.ts` is required to contain two
phrases verbatim, checked by `tests/unit/list-available-metrics.test.ts` (AC-MF2) and
again over the wire by `scripts/smoke-stdio.mjs`. They are product, not legal boilerplate.

**"no nutrition or energy-balance data."** Energy balance is one of the two drivers in the
tree above, so a model reading a metric list that includes body fat, weight, strain and
recovery has every reason to assume calories are in there too — it is the obvious next
question, and the driver tree makes it the *right* next question. It is not available
here. Without the phrase, a model does not fail to answer; it infers intake from the
metrics it does have and answers wrongly. The description is the only thing a model reads
before deciding whether this server can help, so the absence has to be stated where it is
read, not discovered on a call.

**"states no cause."** These metrics are observational, single-subject, and move together
for reasons none of them record. Strain up and recovery down on the same day is a
correlation of two sensors, not a mechanism. A model handed a set of co-moving daily
series will narrate causes unless told not to — and a health context is where that costs
the most. This is the same principle the dashboard's stall badge follows: the badge
reports that the trend moved and never asserts why. The server inherits it because it is
the same product, not because MCP asks for it.

The caveats in `src/caveats.ts` carry both boundaries again in the response body, and are
emitted on both channels so a client that ignores structured output still sees them.
Whoop's proprietary composites (`recovery_score`, `day_strain`) get named as vendor-
computed when present, for the same reason: a score that is not a measured quantity should
not be compared against one that is.

## Delivery principle

Thin vertical slices over wide ones: the smallest end-to-end usable slice first,
enhancements as separate follow-ups. Slice 1 shipped a complete, honest answer to a narrow
question rather than a partial answer to a broad one.
