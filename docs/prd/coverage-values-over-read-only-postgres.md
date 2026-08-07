# PRD: Coverage Values over Read-Only Postgres (Slice 3)

> Repo: `jerkai-mcp`.
> **Id series:** `AC-CV1`–`AC-CV14b` (new two-letter prefix, avoiding collision with the
> shipped `AC-MF*` and `AC-DM*` series) and `NFR-G`–`NFR-J` (continuing this repo's lettered
> NFR series — max allocated is `NFR-F`, Slice 2). Verified 2026-08-05 by grepping both the
> vault (`Career/Projects/*.md`) and this repo's `src/`, `tests/`, `scripts/`, `docs/` — no
> `AC-CV*` exists anywhere yet and no `NFR-G`..`NFR-J` exists anywhere yet.

---

**0. Definition of Ready (DoR)**

Before initiating implementation of this slice, the following prerequisites must be met:

1. **Read-only Neon role provisioned — RESOLVED 2026-08-04.** jerkai_mcp_ro is created on  
    jerkai's production Neon project via CREATE ROLE ... WITH LOGIN in SQL (deliberately  
    not the Neon Console/CLI/API role-creation paths, which grant neon_superuser  
    membership and would have defeated the read-only guarantee), granted SELECT only on  
    biometric_readings, whoop_workouts and sync_runs — and explicitly **not**  
    whoop_tokens — per DL-2026-07-27-a3. **Verified, not just created — commands carried,  
    not the fact** (falsify pass 2, finding B6, blocking; DL-2026-07-31-d's own rule): psql "$MCP_DATABASE_URL" -c "select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname='jerkai_mcp_ro';"    -- expect: all f psql "$MCP_DATABASE_URL" -c "select table_name, privilege_type from information_schema.role_table_grants where grantee='jerkai_mcp_ro';"   -- expect: 3 rows, SELECT only psql "$MCP_DATABASE_URL" -c "select 1 from whoop_tokens limit 1;"             -- expect: permission denied psql "$MCP_DATABASE_URL" -c "insert into sync_runs(source,status) values('whoop','success');" -- expect: permission denied Run by Albert, 2026-08-04, against the production Neon project; output matched every expectation above. Reached through MCP_DATABASE_URL, distinct  
    from jerkai's own DATABASE_URL and every other secret named in  
    [JerkAI - Architecture & Data Model](JerkAI%20-%20Architecture%20&%20Data%20Model) → Environment Variables — set in a local,  
    gitignored .env for dev testing (loading confirmed via node --env-file=.env). Not yet  
    added to any running MCP client's config (e.g. Claude Desktop); that is a runtime-use  
    step, not a Ready gate, and does not block this slice.
2. **CI Neon project exists, not yet connected — commands carried, not the fact** (falsify  
    pass 3, finding 2, blocking; DL-2026-07-31-d's own rule — the same remedy item 1 above  
    already applies). jerkai-mcp-ci (DL-2026-07-28-b) is the project this slice wires up.  
    **Confirmed by direct repo inspection this session, no external API needed:** scripts/ci/  
    does not exist anywhere in this checkout, so the branch-management script this slice adds  
    (scripts/ci/neon-branch.mjs, DL-2026-07-28-b's own fixed filename) is genuinely net-new,  
    not a stale claim. The project's existence and the Actions-secret state live on Neon's and  
    GitHub's side respectively, which a repo checkout cannot confirm — discriminating checks,  
    to be run by Albert and their output recorded here before this slice's PR merges: neonctl projects get jerkai-mcp-ci                    -- expect: project exists, id distinct from jerkai's own project gh secret list --repo albimartai/jerkai-mcp            -- expect: no Neon-API-key secret present yet
3. Connecting the project (adding the secret, the branch script, the CI job) is this slice's  
    own scope (§0.1 decision b), not a Ready gate — it does not block entering build — but per  
    item 1's own remedy, the bare claim "no secret, no script yet" must not stand unconfirmed  
    once made; it is unconfirmed on the Neon/GitHub side until the two commands above are run.
4. **Registry impact identified.** This slice reads the existing filtered registry,  
    DASHBOARD_METRICS exported from src/config.ts (8 keys, confirmed by reading  
    src/config.ts and src/vendor/types.ts:17-29 directly in this session). No re-pin of  
    src/vendor/ is needed and none is in scope.
5. **This slice is AGENTS.md's own named exception, not a violation of it.** The repo's  
    third hard constraint reads: _"No database driver, ORM, credential or SQL... Slice 1 has  
    no database by design; adding one is a scope change needing its own PRD, not a config  
    change."_ This is that PRD. The exception is narrow: one new runtime dependency  
    (@neondatabase/serverless, matching jerkai's own driver choice per  
    [JerkAI - Architecture & Data Model](JerkAI%20-%20Architecture%20&%20Data%20Model) → Storage), one new credential  
    (MCP_DATABASE_URL), one table actually queried (biometric_readings), read-only. No  
    ORM, no ad hoc SQL beyond the one parameterized query this slice adds, no ecosystem beyond  
    that one dependency.
6. **Test approach known.** This repo has had two harnesses since Slice 1 — the node-env  
    Vitest unit suite and the stdio smoke script (jerkai-mcp/docs/definition-of-ready-and-done.md  
    §2). This slice adds a **third: a disposable-Neon-branch integration tier**, the first of  
    its kind in this repo (jerkai has had one since 2026-07-09; this repo has not). Per that  
    same annex, _"a slice that first introduces a new harness lands that setup as a separate  
    self-contained commit ahead of feature work"_ — this slice is that slice, and §0.1(b)  
    below records the decision to do it inside this same PR rather than deferring it.  
    **Build-sequencing directive (formerly NFR-K, withdrawn — see the coverage line in §7 and  
    §8 items 1–2, which record the same withdrawal):** the  
    harness-setup commit (the new tier's config, fixtures, and CI wiring, with no ACs passing  
    against it yet) must exist and be reviewable on the branch before the commit that makes  
    AC-CV1/AC-CV2b/AC-CV11 pass (the integration-tier ACs; renumbered 2026-08-04 when AC-CV2  
    split — see §0.4 finding B3). This is enforced at PR review time by reading git log --oneline on the branch, not by any test — no test tier can observe commit order, which is  
    exactly why it was withdrawn as an NFR rather than kept as one.
7. **Credential and data exposure considered.** This is the scope change item 4 names.  
    Still no write path anywhere in this repo; still no whoop_tokens access; the new  
    credential is read-only at the database level first, a guard test second (§6 NFR-G).
8. **Dependencies / blockers identified.** Blocked on Slice 1 and Slice 2 (shipped, not  
    modified) and item 1 above (not yet satisfied).
9. **Reference artifact linked.** The tool contract already shipped: MetricEntrySchema in  
    src/tools/list-available-metrics.ts:31-42 already names and describes all five coverage  
    fields, typed z.null() as a placeholder. This slice's job is exactly those five fields,  
    nothing else — the shipped schema is the spec of the _shape_; §3 below is the spec of the  
    _values_.
10. **Dev environment plan clear.** MCP_DATABASE_URL as a local env var for manual dev  
    testing (never committed); .env.example documents its name and purpose, never a value.  
    JERKAI_REPO (already used by scripts/check-vendor-drift.mjs) is reused, not  
    reinvented, to give the integration harness access to jerkai's migration files.

**0.1 Decisions confirmed this session (2026-08-04) — not yet logged**

Albert confirmed the following in the conversation that produced this PRD. **No Decision Log  
id has been allocated for them** — per this stance's rule, only the decision-log skill  
allocates ids, and it has not been run. Flagged in this PRD's cover report for a  
decision-log pass; cite them here as "confirmed, unlogged" until then, never as a  
{{DL-pending}} placeholder.

- **(a) This is the next slice.** Real unit/earliestDay/latestDay/dayCount/gapDays  
    values, wired into list_available_metrics only, over the read-only Postgres role the  
    Product Brief roadmap already names ("real coverage values over a read-only Postgres role,  
    then a gap-aware metric series tool"). Confirmed after clarifying that the shipped server  
    is already usable in a real MCP client (e.g. Claude Desktop) today — registering it needs  
    no PRD — and that what this slice specifically unlocks is _real_ answers instead of null  
    ones once registered.
- **(b) The disposable-Neon-branch integration tier ships inside this same PR**, not deferred  
    to a fast-follow. Considered: (A) ship this slice with unit tests against a stubbed query  
    layer plus a manual dev-branch spot-check for DoD, deferring the integration tier to its  
    own later slice; (B) stand up the tier now, reusing the already-created jerkai-mcp-ci  
    Neon project (DL-2026-07-28-b). **Chose B.** The marginal cost is lower than the harness  
    DL-2026-07-27-b once rejected as bloating a single PR — that combined a new repo, CI  
    pipeline, Neon-branching harness, DB client and two tools; here the project already exists  
    and only the wiring (Actions secret, branch script, one CI job) remains. Against that,  
    dayCount/gapDays are exactly the class of computed-from-real-data logic this repo's  
    "never guess, never report a zero that means we didn't look" discipline exists to protect,  
    and shipping that logic without integration-level DB testing in CI leaves it unexercised  
    for as long as the fast-follow is deferred.
- **(c) The read-only role is a build-blocking DoR item, not an Open Question.** Confirmed  
    not yet provisioned (checked directly against the Neon console, 2026-08-04). Recorded in  
    §0 item 1 rather than §8, because a slice cannot meaningfully enter build without it — this  
    is a Definition-of-Ready gate, not a question the build agent could default around.  
    **RESOLVED 2026-08-04** — jerkai_mcp_ro provisioned and independently verified (role  
    flags, exact grants, and a functional psql check); see §0 item 1. This slice's DoR is  
    now fully satisfied.

**0.2 Open questions carrying defaults**

None block Ready. The following are engineering-shape decisions with no product-facing  
consequence, defaulted here so build is not blocked; each is checkable by a named AC.

- **OQ-1 (unit conflict).** If biometric_readings.unit disagrees across rows for one  
    (source, metric), do not guess. Default: return unit: null and add a caveat naming the  
    metric as having an inconsistent recorded unit (AC-CV4). Rejected: picking the newest row's  
    value, which would silently prefer one truth over another with nothing to reveal it.
- **OQ-2 (DB failure handling).** Default: a coverage-query failure (connection error,  
    timeout) degrades the whole list_available_metrics response to Slice 1's shape — every  
    coverage field null for every metric, plus one new caveat — rather than failing the tool  
    call outright (AC-CV3). Rejected: throwing and returning isError: true, which would make  
    the tool strictly worse than Slice 1 on a transient DB hiccup, since the registry list  
    itself needs no database and stays valid.
- **OQ-3 (query shape — batched vs. per-key).** Default: one grouped SQL query per  
    list_available_metrics call, scoped to exactly the registry's (source, metric) pairs,  
    not 8 separate round trips. Non-blocking efficiency preference, not a hard requirement —  
    named in §5.7 rather than as its own AC, since Albert did not ask for a query-count  
    guarantee.
- **OQ-4 (describe_metric stays untouched).** Default: no. Coverage is explicitly out of  
    scope for that tool per its own shipped PRD §2 ("A metric's meaning is knowable without  
    data; its coverage is not") — this slice does not revisit that boundary.
- **OQ-5 (whoop_workouts / sync_runs).** Default: not queried by this slice. The  
    read-only role's grant already includes them (DL-2026-07-27-a3, provisioned ahead of need  
    for the later series-tool slice) but every coverage field this slice computes is derivable  
    from biometric_readings alone.
- **OQ-6 (connection lifecycle).** Default: lazy — the DB client connects on the first  
    list_available_metrics call, never at server startup, matching @neondatabase/serverless's  
    HTTP-based driver (no persistent pool needed at single-user volume) and keeping  
    describe_metric (no DB access) unaffected by this slice at all.

  

  

**1. Overview & Goal**

Slice 1 shipped list_available_metrics's full response shape with every coverage field  
structurally present but always null — the shape was final, the data was not wired up.  
Slice 2 added driver-tree semantics via a second tool, still with no database access  
anywhere in the repo. This slice is the first to open a database connection: a read-only  
role, scoped to exactly the fields Slice 1 already typed and described, on the table that  
already holds them. No new tool, no schema change in jerkai, no write path.

**Primary goals:**

1. unit, earliestDay, latestDay, dayCount and gapDays become real per  
    (source, metric), sourced from jerkai's biometric_readings table via MCP_DATABASE_URL.
2. AGENTS.md's "no database" hard constraint is formally and narrowly lifted for this one  
    dependency and one query path — nothing else about the repo's boundaries changes.
3. A disposable-Neon-branch integration tier is stood up, reusing the already-created  
    jerkai-mcp-ci project (DL-2026-07-28-b), giving this repo its first DB-backed CI  
    coverage.
4. The honesty contract holds under real data: a metric with zero rows is distinguishable  
    from "not yet reported" (§5.2), and a data anomaly (disagreeing units) fails toward  
    null + a caveat, never toward a guess.

  

**2. What this slice is NOT**

- **NOT a write path.** Read-only, enforced by the database role first (DL-2026-07-27-a3), a  
    code-level guard second (NFR-G, AC-CV6).
- **NOT a change to describe_metric.** Its own shipped PRD explicitly excludes coverage  
    (§2 there: _"a metric's meaning is knowable without data; its coverage is not"_). This  
    slice does not touch src/tools/describe-metric.ts, src/metric-semantics.ts, or that  
    tool's tests (AC-CV10 is the regression proof).
- **NOT a trend or series tool.** No rolling averages, no get_metric_series, no derived  
    statistic beyond count/min/max/gap-count. That is the Product Brief's next roadmapped step  
    ("...then a gap-aware metric series tool") and is deliberately deferred.
- **NOT querying whoop_workouts or sync_runs.** The role's grant includes them  
    (provisioned ahead of need, DL-2026-07-27-a3) but this slice's own queries touch  
    biometric_readings only (OQ-5).
- **NOT a second credential surface.** MCP_DATABASE_URL is new and distinct from every  
    secret named in [JerkAI - Architecture & Data Model](JerkAI%20-%20Architecture%20&%20Data%20Model) → Environment Variables  
    (DATABASE_URL, HEALTH_EXPORT_SHARED_SECRET, CRON_SECRET, the Whoop OAuth vars) and  
    from jerkai-mcp-ci's own CI-only Neon API key.
- **NOT a schema change in jerkai.** This slice reads the existing biometric_readings  
    table as-is. No DDL runs from this repo, ever has, ever will under this PRD.
- **NOT a resolution of the still-open jerkai/jerkai-mcp docs/context.md driver-tree  
    reconciliation** (DL-2026-08-03-a2, FM-15). Unrelated to this slice; not bundled here.
- **NOT lifting AGENTS.md's dependency constraint wholesale.** Only  
    @neondatabase/serverless is added. No ORM, no second driver, no credential beyond  
    MCP_DATABASE_URL, no table beyond the three the role grants.

  

**3. Coverage computation contract**

Not a new tool — a change to what list_available_metrics's already-shipped, always-null  
coverage fields (MetricEntrySchema, src/tools/list-available-metrics.ts:31-42) actually  
return.

**Data source:** jerkai's biometric_readings table  
([JerkAI - Architecture & Data Model](JerkAI%20-%20Architecture%20&%20Data%20Model) → Data Model), reached via MCP_DATABASE_URL. The  
table's own unique (source, metric, reading_date) constraint is load-bearing here — it is  
what makes dayCount a simple COUNT(*) safe without a DISTINCT. **reading_date is a  
date column, but @neondatabase/serverless does not return it as a string** (falsify pass  
2, finding B4, blocking): DATE (oid 1082) is parsed into a local-time JS Date, and  
count(*) (bigint, oid 20) is parsed into a string. Left uncast, earliestDay/latestDay  
can shift by a calendar day depending on the process's TZ, and a string dayCount fails  
OutputSchema.parse's z.number() outside src/db.ts's own error boundary — breaking NFR-I  
on a _successful_ query. **The query casts on the SQL side, exactly as every other read path  
in jerkai already does** (lib/dashboard/data.ts:56-57:  
to_char(reading_date, 'YYYY-MM-DD') as reading_date, value::float8 as value):  
to_char(min(reading_date), 'YYYY-MM-DD'), to_char(max(reading_date), 'YYYY-MM-DD'),  
count(*)::int — so no JS-side date or number coercion happens at all, and the driver's own  
type parsers never see a DATE or a bigint from this query. This is also the annex's re-armed  
DoRD item, docs/definition-of-ready-and-done.md:103 ("Shared date key — re-armed by the  
first slice that reports a date range or day count, which must normalize to the device-local  
calendar day exactly as jerkai does") — this slice is that slice, and the to_char cast is  
how it satisfies it (AC-CV13).

**Query shape:** one grouped read per list_available_metrics call, scoped to exactly the  
(source, metric) pairs named by DASHBOARD_METRICS (src/config.ts) — never SELECT *,  
never an unscoped table scan (OQ-3).

**Per (source, metric):**

- **dayCount** = number of matching rows (COUNT(*), safe per the unique constraint  
    above). **0 is a real, honest value the moment this slice ships** — it means the query  
    ran and found nothing, which is a different fact from the pre-slice null, which meant no  
    query ever ran at all (§5.2).
- **earliestDay / latestDay** = MIN/MAX(reading_date), formatted YYYY-MM-DD. null  
    when dayCount is 0 — there is no range to report.
- **gapDays** = (inclusive calendar-day span between earliestDay and latestDay) minus  
    dayCount. null when dayCount is 0, for the same reason. A single-row metric  
    (dayCount = 1) yields gapDays = 0, not null — a real, computed answer, not a  
    degenerate case to special-case away.
- **unit** = the single distinct non-null unit value across the metric's rows. null,  
    plus a new caveat naming the metric, when zero or more than one distinct value is found  
    (OQ-1) — never guessed, never the newest row's value picked silently.

**Failure mode:** if the coverage query itself fails (connection error, timeout, DB  
unreachable), list_available_metrics still returns successfully — the registry list and  
the three pre-existing static caveats (COVERAGE_CAVEAT's successor, NO_NUTRITION_CAVEAT,  
NO_CAUSE_CAVEAT) need no database — but every coverage field for every metric comes back  
null for that call, plus a new caveat stating coverage was unavailable this call (OQ-2).  
The tool never throws, and never returns isError: true, solely because the database is  
unreachable.

**Schema change (protocol contract, not database schema):** MetricEntrySchema's five  
coverage fields move from literal z.null() (Slice 1's always-null placeholder) to real  
nullable types: unit: z.string().min(1).nullable(); earliestDay / latestDay:  
z.string().nullable() (ISO date); dayCount / gapDays:  
z.number().int().nonnegative().nullable(). The root and all fields stay .strict()  
(AC-CV8) — only the coverage fields' own types change, nothing about closedness does.

  

**4. Architecture & required reading**

**Required reading before touching anything** (each file's relevant fact, verified in this  
session, not carried over from an older doc):

- src/tools/list-available-metrics.ts:31-42 (MetricEntrySchema, five z.null() coverage  
    fields) and :76-104 (buildResult/handleListAvailableMetrics, both synchronous today).
- src/config.ts (DASHBOARD_METRICS, 8 keys) and :25 (the "silently drop" comment the  
    AC-CV6 guard must not trip on).
- src/caveats.ts:32-33 (COVERAGE_CAVEAT text) and src/tools/describe-metric.ts:3,113  
    (its other consumer).
- tests/unit/schema-guards.test.ts:25-36 (DB_PACKAGES denylist, already lists  
    @neondatabase/serverless) and :185-189 (DoD-5 SQL-keyword regex).
- scripts/smoke-stdio.mjs:149-159 (the pre-slice "every coverage field is null" smoke  
    assertion).
- node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:261 (ToolCallback  
    accepts Promise).
- vitest.config.ts (no projects field, test.include scoped to tests/unit/** only).
- jerkai/lib/dashboard/data.ts:56-57 (to_char/::float8 cast precedent) and jerkai's  
    biometric_readings migration (unique (source, metric, reading_date) constraint).

**New files** (exact internal shape is the build's choice; the constraints named are not):

- A DB client module (e.g. src/db.ts) — lazily initializes an @neondatabase/serverless  
    client from MCP_DATABASE_URL (OQ-6) and runs the single grouped coverage query.
- scripts/ci/neon-branch.mjs — creates a disposable branch inside jerkai-mcp-ci  
    (verified by project id, §5.6), applies jerkai's migrations to it via the  
    vendor-drift.yml-style JERKAI_REPO checkout, and tears the branch down after the run  
    regardless of pass/fail. Filename fixed by DL-2026-07-28-b's own Affects line — do not  
    rename.
- scripts/ci/neon-branch.d.mts (falsify-diff pass, 2026-08-07 — newly added to the file  
    budget) — hand-written type declarations for neon-branch.mjs's findTargetProject and  
    verifyTargetProject, consumed by the integration test's dynamic import of the .mjs file.
- Fixture/seed logic for the integration tests — a small, deterministic set of rows across  
    2–3 metrics with a known, deliberately gapped date range, inserted by the test setup  
    itself. Never real data, never a copy of any production row.
- **A Vitest multi-project config** (falsify pass finding 3, 2026-08-04; **narrowed to a  
    single mechanism by falsify pass 7, finding 1, blocking**): vitest.config.ts as it exists  
    today has no projects field and test.include is scoped to tests/unit/** only,  
    confirmed by reading the file directly in this session — the new integration tier is not  
    discoverable to npm test without one. **The earlier draft's vitest.workspace.ts  
    alternative does not exist as a mechanism under this repo's pinned Vitest.** Verified  
    directly against the installed package (node_modules/vitest, matching package.json's  
    ^4.1.10 pin): neither defineWorkspace nor any workspace config field appears anywhere  
    in that version's own type definitions — only defineProject/test.projects do. A build  
    session that reached for vitest.workspace.ts would ship a silently unrecognized file, and  
    npm test would report green while the entire integration tier — including AC-CV1, this  
    PRD's own labeled load-bearing test — never runs. The only viable mechanism is a projects 
    array added to the existing vitest.config.ts, naming both the existing unit project and a  
    new integration project scoped to its own test directory (e.g. tests/integration/**).

**CI wiring for AC-CV9** (falsify pass finding 7, non-blocking): the .github/workflows/ci.yml  
integration job must run scripts/ci/neon-branch.mjs to seed a branch, export its connection  
string as MCP_DATABASE_URL for the smoke step specifically (never for the unit-test step,  
which stays DB-free), run npm run smoke against it, and tear the branch down after — named  
as its own step so a reader of the workflow file can see the data path AC-CV9 depends on  
without inferring it from the job's shape.

**CI wiring for AC-CV13's integration half** (falsify pass 7, finding 2, blocking): the same  
integration job's Vitest step — the one that runs the new integration project against the  
seeded branch (AC-CV1, AC-CV2b, AC-CV11) — must also set TZ=Europe/Madrid (or any other  
non-UTC zone) for that step specifically, never for the unit-test step or the smoke step.  
GitHub's ubuntu-latest runner defaults to TZ=UTC, under which the day-shift bug AC-CV13  
exists to catch cannot manifest — a date value already sitting at local midnight never  
crosses a day boundary when re-interpreted as UTC. Without this, AC-CV13's Integration  
sub-clause would pass on an uncast query exactly as readily as on a correctly to_char/::int  
cast one — a check that cannot discriminate the failure from a benign cause, FM-03's own  
shape, undermining the NFR-I guarantee it exists to prove (FM-07).

**Files this slice modifies:** src/tools/list-available-metrics.ts (including  
TOOL_DESCRIPTION, per the required-reading note above), src/caveats.ts,  
package.json (new runtime dependency, new devDependency for the migration runner used by  
the CI script), vitest.config.ts — **test.projects added to the existing file is the only  
viable mechanism, not a build's choice** (falsify pass 7, finding 1, blocking, superseding the  
earlier draft's vitest.workspace.ts alternative — see "New files" above), .env.example,  
README.md, AGENTS.md, docs/context.md, docs/definition-of-ready-and-done.md (repo  
annex), .github/ISSUE_TEMPLATE/feature.md (falsify pass 7, finding 3, blocking — newly added  
to the file budget), .github/workflows/ci.yml (including the integration job's TZ env var  
— falsify pass 7, finding 2, blocking), scripts/smoke-stdio.mjs,  
tests/unit/list-available-metrics.test.ts — **not just the stale-caveat assertion  
(AC-MF7a) and the new coverage tests, but every existing call site that invokes buildResult  
or handleListAvailableMetrics** (AC-MF4, AC-MF5a, AC-MF5b, AC-MF5c, AC-MF6, AC-MF7a,  
AC-MF7b), which must add await/async once both functions are async (§4's ordered-path note, 
re-verification finding, blocking) — a mechanical amendment to shipped assertions, not new  
coverage, and not a behavior change to any of them, **tests/unit/schema-guards.test.ts —  
mandatory, not conditional** (falsify pass 2, finding B1, blocking): the DB_PACKAGES  
denylist and the DoD-5 SQL-keyword regex must both be narrowed to admit exactly this slice's  
one dependency and one read query; AC-MF1b-1, AC-MF1b-2 and the DoD-5 check are amended  shipped assertions here, not new coverage. **The DoD-5 narrowing is a keyword-set edit, not  just a file-scope edit** (falsify pass 9, finding 2, blocking — see AC-CV12(b)): the regex at  line 186 drops select\s+.+\s+from from its banned pattern set, retaining  
insert\s+into|update\s+\w+\s+set|delete\s+from, since this slice's own query is itself a  
SELECT and file-scope narrowing alone cannot make it pass an unmodified regex — **and,  
independently of that guard-narrowing  
work, its seven existing synchronous buildResult() call sites (lines 218, 224, 231, 245, 260,  
319, 333) must add await/async once buildResult is async** (falsify pass 9, finding 1,  
blocking; §4's ordered-path note above). `package-lock.json` will mechanically change (new dep + devDep). eslint.config.mjs  
(falsify-diff pass, 2026-08-07 — newly added to the file budget): adds fetch: "readonly" to  
the globals list, needed because scripts/ci/neon-branch.mjs calls the global fetch.

**The SQL/JS boundary** (falsify pass 2, finding B2, blocking — previously unstated, which  
left AC-CV2a, AC-CV4 and AC-CV5's tier assignments unfalsifiable): src/db.ts returns **raw  
per-pair aggregates only** — rowCount (an int), minDay/maxDay (YYYY-MM-DD strings,  
already cast per §3), and distinctUnits (a string array) — as primitives, with no derived  
value computed in SQL. Every derived value — the dayCount pass-through, the gapDays  
arithmetic, the unit-conflict decision, and the zero-row 0-vs-null distinction — is  
computed by a pure, exported function in src/tools/list-available-metrics.ts (e.g.  
deriveCoverage(aggregate): CoverageFields). This is what AC-CV5 calls directly (no DB), what  
AC-CV2a and AC-CV4 call against a constructed aggregate (no DB), and what AC-CV1/AC-CV2b exercise end-to-end.

**Ordered path a list_available_metrics call takes** (FM-06 — stated in full since it now  
spans a new file):

1. src/server.ts registers list_available_metrics with its existing zero-arg handler —  
    unchanged.
2. src/tools/list-available-metrics.ts's buildResult calls the new src/db.ts coverage  
    query once, scoped to Object.values(DASHBOARD_METRICS). **buildResult and  
    handleListAvailableMetrics both become async** (verified 2026-08-05, re-verification  
    finding, blocking): today both are synchronous (buildResult returns  
    ListAvailableMetricsResult directly, not a Promise — read directly from  
    src/tools/list-available-metrics.ts:76-104 this session), and an HTTP-based driver  
    (@neondatabase/serverless, OQ-6) has no synchronous query path. The MCP SDK's own  
    ToolCallback type already accepts `SendResultT | Promise<SendResultT>`  
    (node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:261, checked this  
    session), so server.ts's zero-arg registration (`() => handleListAvailableMetrics({})`)  
    needs no change — the arrow function already returns whatever its callee returns, sync or  
    async — but every existing call site that calls either function synchronously does. That  
    is not confined to the "stale-caveat assertion" the file-budget line below once named: it  
    is essentially the whole of tests/unit/list-available-metrics.test.ts (AC-MF4, AC-MF5a,  
    AC-MF5b, AC-MF5c, AC-MF6, AC-MF7a, AC-MF7b — every `describe` block that calls  
    buildResult() or handleListAvailableMetrics({}) without awaiting it, confirmed by direct  
    read of tests/unit/list-available-metrics.test.ts this session), which must add `await`  
    and mark its `it` callbacks `async`. Mechanical, not a design choice, but real enough to  
    misjudge as a one-line fix if left unstated — the AC-MF4 "every coverage field null"  
    assertion itself still holds unmodified in the unit tier (no MCP_DATABASE_URL there, so  
    the query fails and degrades per OQ-2/§3's failure mode), which is exactly the shape that  
    invites treating the whole file as untouched. It also is not confined to that one file  
    (falsify pass 9, finding 1, blocking): tests/unit/schema-guards.test.ts imports the bare  
    buildResult from list-available-metrics.js and calls it synchronously at lines 218, 224,  
    231, 245, 260, 319 and 333 (AC-MF1c-2, AC-MF8, AC-DM11's cross-tool checks) — every one of  
    these must also gain `await` and an `async` `it` callback once buildResult is async.
3. src/db.ts runs the grouped query and returns either a map of per-metric raw aggregates  
    (per the SQL/JS boundary above) or a failure sentinel (§3's failure mode) — it never throws  
    past its own boundary.
4. buildResult calls deriveCoverage on each registry entry's aggregate (or applies  
    all-null on failure), builds the payload, and passes it through the revised  
    deriveCaveats (now aware of the unit-conflict and DB-failure cases) and the unchanged  
    assertDomainKeys.
5. handleListAvailableMetrics emits on both channels exactly as today — unchanged.

  

**5. Technical risks & implementation pitfalls**

1. **The shipped schema is z.null()-typed for a reason that ends today.** Slice 1's five  
    coverage fields are literal z.null(), not a nullable union — a real, deliberate  
    breaking change to an already-shipped, publicly documented protocol contract. Not a  
    concern this repo needs to version around (single-user, pre-1.0, "version": "0.1.0"),  
    but the test suite must exercise both states explicitly (populated and zero-row), since  
    the existing tests only ever exercised "always null."
2. **dayCount: 0 is now honest, but only because this slice always queries.**  
    AGENTS.md's trap text — _"dayCount is null, never 0... this server never looked"_ — is  
    exactly half-obsolete: it stays true when a query fails (§3's failure mode), and becomes  
    false-by-design when a query succeeds and finds nothing. Null means "did not look, or  
    could not"; 0 means "looked, found nothing." A lazy ?? null fallback in the merge step  
    (§4 ordered-path step 4) could silently convert a real 0 into null, or the reverse —  
    this is this slice's own bare/entry case (FM-02): a registry entry with zero ingested  
    rows, e.g. a metric added to the registry before its first sync ever ran.
3. **COVERAGE_CAVEAT's text is now wrong for list_available_metrics, but the constant  
    itself is shared and must not change.** src/caveats.ts:32-33 states unit/coverage "are  
    not yet reported by this server." Leaving it in list_available_metrics's own caveat list  
    while the fields go real is FM-07's shape inverted — a caveat claiming a limitation the  
    code no longer has. But describe_metric imports the same constant  
    (src/tools/describe-metric.ts:3,113) and its own PRD forbids it from reporting coverage  
    at all — editing COVERAGE_CAVEAT's text in place would silently make that tool's caveat  
    false instead (falsify pass 6, blocking). The fix is scoped to list_available_metrics  
    removing the constant from its own default caveat list, never to editing the constant.
4. **Seven documents assert "no database" or "no coverage," and all seven go false the  
    moment this ships — several of them in more than one place** (falsify pass 7, finding 3,  
    blocking, widening the earlier draft's undercount of six) — five inside jerkai-mcp  
    (README.md, AGENTS.md, .env.example, docs/context.md, and  
    .github/ISSUE_TEMPLATE/feature.md — §4 names all five with line numbers; the fifth,  
    feature.md, was outside the file budget entirely until this pass) and **two in the  
    sibling jerkai repo** (falsify pass 2, finding B7, blocking): jerkai/docs/context.md:52-53  
    — _"Neither reports coverage — it holds no credential, opens no database connection, and  
    reports coverage as null rather than guessing"_ — and jerkai/README.md:63 — _"It opens no  
    database connection and holds no credential of any kind, and it reads no value out of  
    biometric_readings."_ **The same jerkai/README.md:63 sentence is also stale for an  
    unrelated, pre-existing reason** (re-verification finding, 2026-08-05, not blocking this  
    slice's own build): its opening clause — _"It ships one tool today,  
    list_available_metrics"_ — has been wrong since Slice 2 shipped describe_metric on  
    2026-08-03; read directly against jerkai-mcp/README.md this session, the repo has shipped  
    two tools for two days already. Not this slice's defect and not newly caused by it, but  
    folded into the same jerkai-side fast-follow (§8 item 6(d)) since it sits in the identical  
    sentence the coverage claim also falsifies — fixing one clause and leaving the  
    line-adjacent falsehood unflagged would be its own instance of FM-13's pattern. Within  
    jerkai-mcp, README.md and AGENTS.md each carry a  
    second false-on-merge passage beyond the one originally named — README.md:58-59  
    (_"dayCount is null, never 0... this server never looked"_) and README.md:61-64  
    (the caveats-array claim), and AGENTS.md:46-50's Traps section entry for dayCount — all  
    now in §4's required reading. This is FM-13's exact pattern, sighted repeatedly across  
    this PRD's own revision history: a scope-exclusion document, or a passage within one,  
    falsified by the very session that changes it, missed the first time because it lives  
    outside the file everyone was already looking at. Five of the seven — the  
    jerkai-mcp-side documents — are corrected in this PR; the two jerkai-side documents are  
    flagged for a fast-follow per §8 item 6(d), not fixed here (falsify pass 5, finding 1,  
    blocking).
5. **Unit conflict is a real possibility, not a hypothetical.**  
    biometric_readings.unit is a nullable free-text column per row  
    ([JerkAI - Architecture & Data Model](JerkAI%20-%20Architecture%20&%20Data%20Model) → Data Model), not derived from a fixed lookup —  
    nothing in the schema guarantees every row for one (source, metric) shares a unit. This  
    is exactly the case OQ-1's "never guess" default exists for.
6. **The disposable-branch harness must never point at jerkai's real project, or at a  
    persistent jerkai-mcp-ci branch, by accident.** Per DL-2026-07-28-b the branch is forked  
    _within_ jerkai-mcp-ci (a project distinct from jerkai's own), migrated fresh from  
    jerkai's migration files, and seeded only with this slice's own small fixture — never a  
    copy of, or a connection string pointing at, any real data. scripts/ci/neon-branch.mjs  
    should verify the target project id before creating anything, and this is worth its own  
    AC (AC-CV11) precisely because a harness that silently ran against the wrong project would  
    produce green output indistinguishable from a correctly isolated one.
7. **A batched query is not the same as 8 separate queries, and nothing but a query-count  
    assertion can tell them apart.** A naive per-key loop produces identical response shapes  
    at 8x the round trips. OQ-3 defaults to batched but leaves this a non-blocking preference  
    rather than a hard requirement, since Albert did not ask for a query-count guarantee —  
    named here so a future session does not mistake the absence of an AC for the absence of a  preference.

  

**6. Non-Functional Requirements (NFRs)**

- **NFR-G (Read-only enforced by the database first, by a guard second):** the role this  
    slice's connection uses holds SELECT only, on biometric_readings, whoop_workouts and  
    sync_runs (DL-2026-07-27-a3) — this slice's own queries touch biometric_readings alone  
    (OQ-5), but the role's broader grant is inherited, not requested fresh. No write statement  
    and no DDL anywhere in the **runtime connection path** (src/db.ts and its callers),  
    checked by a guard that scans query strings **in src/db.ts only** for  
    INSERT/UPDATE/DELETE/CREATE/DROP/ALTER. **Narrowed 2026-08-04 (falsify finding  
    4, non-blocking):** the original "anywhere in this slice's code" over-claimed, since  
    scripts/ci/neon-branch.mjs necessarily runs migration DDL to stand up the disposable  
    branch, lives under scripts/, and is out of the guard's scope by design — the guard's job  
    is the server's own query path, not the test harness that seeds it. **Scope corrected  
    2026-08-05 (eighth falsify pass, finding 1, blocking — see AC-CV6's Given clause above,  
    which states the same src/db.ts-only scope):** the guard's stated  
    domain is src/db.ts itself, not the wider src/ tree — the SQL/JS boundary (§4) forbids  
    callers from holding query text at all, so src/db.ts is exhaustive by construction, and a  
    whole-tree scan would trip on unrelated prose (e.g. src/config.ts:25's comment about  
    silently "drop"ping new axes). "src/db.ts and its callers" above names NFR-G's inherited,  
    broader conceptual domain (the runtime connection path); the guard's actual scanned scope is  
    narrower, and AC-CV6/AC-CV12 are what's actually tested.
- **NFR-H (Credential isolation):** MCP_DATABASE_URL is the only new environment variable  
    this slice reads, and it is read from nowhere but src/db.ts. It is never logged, never  
    templated into an error message, and this slice never selects raw_payload (the one  
    column in biometric_readings that could carry sensitive detail beyond the five coverage  
    fields it computes).
- **NFR-I (A database failure degrades to the pre-slice shape, never to an error):** the  
    property in §3's failure mode, restated as a requirement — a coverage-query failure never  
    causes list_available_metrics to throw or to return isError: true.
- **NFR-J (dayCount: 0 vs. null is a stated, tested distinction):** the property in §5.2  
    — 0 means the query ran and found nothing; null means it did not run to completion. No  
    code path may substitute one for the other via a falsy-coalescing shortcut.

  

**7. Acceptance Criteria & Test Tiering Matrix**

- **AC-CV1: Real coverage for a populated metric** _[Tier: Integration — disposable Neon  
    branch]_ — **load-bearing test for this slice.**

- Given a disposable branch seeded with a known, deliberately gapped set of rows for  
    (whoop, recovery_score),
- When list_available_metrics is called against a server pointed at that branch,
- Then that entry's dayCount, earliestDay, latestDay, gapDays and unit match the  
    seeded fixture exactly — proving the harness is genuinely connected and computing real  
    values, not trivially returning empty-success (§5.6).

- **AC-CV2a: Bare/entry case, pure function** _[Tier: Unit Test]_ (FM-02 — split 2026-08-04,  
    falsify pass 2 finding B3, blocking — the original single AC's Given named a disposable-  
    branch DB state a unit tier cannot construct)

- Given a coverage aggregate in which (fitdays, weight) resolved with rowCount: 0,
- When deriveCoverage builds the entry,
- Then dayCount is 0 (strictly, Object.is(entry.dayCount, 0), not null via a ??  
    fallback), and unit/earliestDay/latestDay/gapDays are null.

- **AC-CV2b: Bare/entry case, end-to-end** _[Tier: Integration]_ (FM-02 — the case this slice  
    newly introduces and must not skip)

- Given a disposable branch seeded with zero rows for (fitdays, weight) and rows for at  
    least one other registry pair,
- When list_available_metrics is called against a server pointed at that branch,
- Then (fitdays, weight)'s dayCount is 0 (not null), and its  
    unit/earliestDay/latestDay/gapDays are null, while the other seeded pair returns  
    real values.

- **AC-CV3: Database failure degrades gracefully** _[Tier: Unit Test, mocked failure]_

- Given the coverage query rejects (simulated connection error),
- When list_available_metrics is called,
- Then the call still succeeds (isError is not true), the registry and the three  
    pre-existing caveats are present, every coverage field is null for every metric, and a  
    new caveat states coverage was unavailable this call.

- **AC-CV4: Unit conflict resolves to null + caveat, never a guess** _[Tier: Unit Test]_  
    (Given restated 2026-08-04, falsify pass 2 finding B3, blocking — the original Given named  
    raw DB rows, a state no unit tier can construct)

- Given a coverage aggregate in which one (source, metric)'s distinctUnits array has two  
    non-null entries,
- When deriveCoverage builds the entry and deriveCaveats runs,
- Then that entry's unit is null, and a caveat names the specific metric as having an  
    inconsistent recorded unit. (If the unit-conflict decision is ever moved into SQL instead  
    of deriveCoverage, this AC's Tier must move to Integration alongside it — see §4's  
    SQL/JS boundary note.)

- **AC-CV5: gapDays arithmetic** _[Tier: Unit Test — deriveCoverage, no DB]_

- Given fixed earliestDay/latestDay/dayCount inputs to deriveCoverage (§4's SQL/JS  
    boundary),
- When the gap calculation runs,
- Then gapDays = inclusive day span minus dayCount, tested against a zero-gap case, a  
    multi-gap case, and a single-row case (dayCount = 1 → gapDays = 0, not null).

- **AC-CV6: Read-only enforcement, code-level guard** _[Tier: Unit Test, string guard]_  
    (Rewritten 2026-08-04, falsify pass 2 finding B5, blocking — as originally written this AC  
    already fails today against a pre-existing comment in src/config.ts:25 containing the  
    word "drop," and passes vacuously either way since it cannot discriminate a real write from  
    a read. **Scope disambiguated 2026-08-05, eighth falsify pass finding 1, blocking** — the  
    prior wording, "scope: src/ excluding src/vendor/," was readable as the whole src/  
    tree, which reproduces this exact false positive: src/config.ts:25's comment — _"...it  
    would silently drop legitimately new axes"_ — still matches \bdrop\s+. The scope is  
    src/db.ts only, matching AC-CV12's own scope.)

- Given the query string(s) exported from src/db.ts — **and no other file** (src/db.ts  
    is exhaustive by construction: the SQL/JS boundary in §4 forbids any caller from holding  
    query text at all, so nothing outside this one file needs scanning),
- When matched case-insensitively against  
    /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+|drop\s+|alter\s+|truncate\s+)/i,
- Then no match against the real query text; **and**, as a positive control, a deliberately  
    seeded fixture string containing sql`delete from biometric_readings` is scanned by  
    the same guard and reported, proving the guard can actually fail.

- **AC-CV7: Credential and payload isolation** _[Tier: Unit Test]_ (broadened 2026-08-04,  
    falsify pass finding 2, blocking — the original draft covered only the first of NFR-H's  
    three guarantees)

- Given process.env, the coverage query's SQL/column list, and a simulated query failure,
- When src/db.ts reads its connection string, builds its query, and constructs any error  
    it throws or logs,
- Then: (a) it reads only MCP_DATABASE_URL, never DATABASE_URL or any other named  
    secret; (b) the query's column list never references raw_payload; and (c) no thrown or  
    logged error message contains the connection string or credential value.

- **AC-CV8: Schema stays closed under real values** _[Tier: Unit Test]_

- Given the updated MetricEntrySchema,
- When inspected,
- Then the root and every field remain .strict()/closed, and the five coverage fields  
    accept both a populated value and null — no longer literal z.null().

- **AC-CV9: Protocol-level proof over stdio** _[Tier: Stdio Smoke]_

- Given the built server running against a seeded disposable branch,
- When a real client calls list_available_metrics over the wire,
- Then at least one entry's coverage fields are non-null and match the known fixture —  
    replacing the pre-slice "every coverage field is null" smoke assertion (scripts/smoke-stdio.mjs:149-158).

- **AC-CV10: describe_metric is unchanged** _[Tier: Unit Test, regression]_ (broadened  
    2026-08-04, falsify pass 6, blocking — the original Then clause asserted only the schema  
    and the pre-existing test suite, neither of which pins any caveat's literal text, so a  
    COVERAGE_CAVEAT edited in place would have shipped through this tool uncaught)

- Given describe_metric's existing, unmodified test suite and its shipped response shape,
- When run against this slice's branch,
- Then it still passes unchanged; its schema carries no coverage field anywhere; and its  
    response's caveats array still includes COVERAGE_CAVEAT byte-identical to its  
    pre-slice text (src/caveats.ts:32-33) — proving the constant itself was not edited,  
    only removed from list_available_metrics's own default caveat list.

- **AC-CV11: Disposable-branch harness isolation** _[Tier: Integration harness self-check]_

- Given the CI integration job,
- When it runs,
- Then it operates against a freshly created, freshly migrated branch inside  
    jerkai-mcp-ci (verified against that project's id before use, never jerkai's own  
    project and never a persistent branch), and the branch is torn down after the run  
    regardless of pass or fail.

- **AC-CV12: Dependency, import and SQL-keyword guards narrowed, not disabled** _[Tier: Unit  
    Test]_ (New 2026-08-04, falsify pass 2 finding B1, blocking — this slice's own dependency was  
    previously a guaranteed guard failure with no AC to catch or bound it. **Broadened 2026-08-04,  
    falsify pass 3 finding 1, blocking** — as originally scoped this AC exercised only the  
    DB_PACKAGES denylist and the import-graph walk, while §4's required-reading note and §6/§7/§8  
    all credited it with re-exercising all three guards named there, including the DoD-5  
    SQL-keyword regex at schema-guards.test.ts:185-189 — the exact "prose claims more than its  
    own AC tests" shape FM-07's dated note describes. The regex's narrowing was specified in §4 but  
    left unfalsified by any AC.)

- Given tests/unit/schema-guards.test.ts's DB_PACKAGES denylist, its import-graph walk  
    over all files under src/, **and its DoD-5 SQL-keyword regex scan (lines 185–189)**,
- When run against this slice's code,
- Then: **(a)** @neondatabase/serverless is imported from src/db.ts and nowhere else under  
    src/, and no other entry in DB_PACKAGES (nor any DB driver added by a future slice)  
    appears anywhere in the import graph; **and (b)** DoD-5's SQL-keyword regex  
    (tests/unit/schema-guards.test.ts:186, currently  
    /\b(select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i, which bans  
    SELECT...FROM as well as writes) **is amended in this slice to drop select\s+.+\s+from  
    from its banned-pattern set, retaining insert/update/delete** (falsify pass 9, finding 2,  
    blocking — the query this slice adds is itself a SELECT...FROM, so file-scope narrowing  
    alone cannot make it pass this regex; the write-keyword ban for src/db.ts specifically  
    remains AC-CV6's own, separately-defined regex, which never banned SELECT to begin with).  
    Under the amended DoD-5 regex, scoped to src/db.ts's own query strings only (AC-CV6's  
    scope, disambiguated 2026-08-05 — see AC-CV6's Given clause above, which states the same  
    src/db.ts-only scope), there is no match against this slice's real coverage-query text,  
    while a run of the same scan against AC-CV6's positive-control fixture  
    (sql`delete from biometric_readings`) still reports a match under both AC-CV6's own regex  
    and the amended DoD-5 regex — proving the DoD-5 guard's narrowing bounded it rather than  
    silently disabling it.

- **AC-CV13: Coverage query casts on the SQL side, never in JS** _[Tier: Unit Test +  
    Integration]_ (New 2026-08-04, falsify pass 2 finding B4, blocking — uncast, the driver's  
    own type parsers turn reading_date into a local-time Date and count(*) into a string,  
    breaking NFR-I on a successful query)

- Given the coverage query's SQL text (Unit) and a seeded disposable branch under a non-UTC  
    TZ (Integration, e.g. TZ=Europe/Madrid),
- When inspected (Unit) and when list_available_metrics is called against it (Integration),
- Then every date column is projected through to_char(…, 'YYYY-MM-DD') and every count  
    through an explicit ::int (Unit); and earliestDay/latestDay match  
    /^\d{4}-\d{2}-\d{2}$/ and dayCount is typeof … === "number" for the seeded fixture,  
    unaffected by the process's TZ (Integration).

- **AC-CV14a: Tool description stays honest about coverage, exported constant** _[Tier: Unit  
    Test]_ (New 2026-08-04, falsify pass 2 finding B8, blocking; split from AC-CV14 2026-08-04,  
    falsify pass 4 finding, blocking — the original single AC's Given named the tools/list  
    wire response, a state no unit tier can construct; TOOL_DESCRIPTION was excluded from  
    scope by name in an earlier draft of §4 while asserting exactly the fact this slice changes)

- Given the exported TOOL_DESCRIPTION constant,
- When inspected directly (no server, no wire),
- Then it still contains the "no nutrition or energy-balance data" and "states no cause"  
    phrases verbatim (AC-MF2 regression), and contains no sentence claiming coverage is  
    unavailable or always null.

- **AC-CV14b: Tool description stays honest about coverage, over the wire** _[Tier: Stdio  
    Smoke]_ (New 2026-08-04, falsify pass 4 finding, blocking — the case AC-CV14a alone cannot  
    cover: it proves the constant's text is correct, not that a real client sees that text)

- Given the built server running,
- When a real client calls tools/list over stdio,
- Then list_available_metrics's returned description field contains the same verbatim  
    phrases and omits the same stale claim that AC-CV14a asserts of the constant directly.

**Coverage:** every AC-CV id above is covered exactly once (falsify pass 9, finding 4,  
blocking — enumerated below in full; the prior draft's sentence named this claim without  
listing 6 of the 16 ids). NFR-G ← AC-CV6. NFR-H ←  
AC-CV7 (broadened 2026-08-04, see above). NFR-I ← AC-CV3, AC-CV13. NFR-J ← AC-CV2a,  
AC-CV2b, AC-CV5. NFR-A ← AC-CV8. NFR-C ← AC-CV12 (falsify pass 2, finding B1 — no longer  
"inherited automatically"; the existing guards must be narrowed and are re-exercised by  
name). AC-CV1, AC-CV4, AC-CV9, AC-CV10, AC-CV14a and AC-CV14b are pure  
functional-correctness ACs with no NFR mapping (verified directly against their own  
Given/When/Then, not inherited); each appears exactly once above in §7 and nowhere in this  
coverage line's NFR list by design. NFR-B/NFR-D ← inherited automatically (existing AST guards scan all of src/,  
including new files, with no new AC needed). AC-CV11 verifies harness isolation on its own  
merits (§5 point 6) and no longer maps to an NFR — the commit-ordering property it was mapped  to (NFR-K) is withdrawn; see §0 item 13's build-sequencing directive.

  

**8. Definition of Done**

Feature-specific, in addition to the baseline:

1. All 16 ACs above pass under npm test (Vitest — unit project and the new integration  
    project) and npm run smoke (stdio), as tiered. NFR-G through NFR-J are satisfied by  
    the ACs mapped to them in §7's coverage line; NFR-A, NFR-B and NFR-D are satisfied by  
    the existing AST guards passing against this slice's new files, plus AC-CV8; NFR-C is  
    satisfied only once the DB_PACKAGES denylist, import-graph walk, **and SQL-keyword regex** in tests/unit/schema-guards.test.ts are all narrowed in this slice's own PR and re-exercised  by AC-CV12 (falsify pass 2, finding B1 — these guards do **not** pass unmodified; AC-CV12  broadened per falsify pass 3, finding 1, blocking, to actually re-exercise the SQL-keyword  regex rather than only the first two guards). The build-sequencing directive that replaces  the withdrawn NFR-K (§0 item 13) is satisfied by PR review of commit order, not by  npm test.
2. The disposable-branch integration Vitest project is stood up and green in CI against  
    jerkai-mcp-ci (§0 item 13's build-sequencing directive, formerly NFR-K), with its own  
    Actions secret (a project-scoped Neon API key, DL-2026-07-28-b) added to this repo — never  jerkai's key, never an org-wide one.
3. **No schema change and no migration in jerkai.** This slice reads jerkai's existing  
    biometric_readings table as-is; the _protocol_ schema change (§3) is this repo's own  
    output contract, unrelated to a database migration.
4. MCP_DATABASE_URL is documented by name and purpose in .env.example (sensitive,  
    read-only, provisioned manually — pointing at AGENTS.md), never given a real value in  
    any committed file.
5. README.md, AGENTS.md, docs/context.md, docs/definition-of-ready-and-done.md (repo  
    annex), and .github/ISSUE_TEMPLATE/feature.md (falsify pass 7, finding 3, blocking — newly  
    added to this item's scope) are all revised per §4/§5.4: none may still claim zero database  
    access for list_available_metrics; none may still claim dayCount, the caveats array, or  
    the credential/data surface behave the pre-slice way (README.md:58-59,61-64;  
    AGENTS.md:46-50; .github/ISSUE_TEMPLATE/feature.md:25,30 — falsify pass 7, finding 3, 
    blocking, widening this item's scope from database-access claims alone to value-semantics  
    claims too); while all must still truthfully state the write-path exclusion, the  
    describe_metric boundary, and the narrowed (not removed) dependency constraint.
6. **Product-truth reconciliation flagged in the PR:** (a) AGENTS.md's "no database" hard  
    constraint is narrowed, not removed — cite this PRD; (b) DL-2026-07-27-a3 and  
    DL-2026-07-28-b move from "decided, unconsumed" to "consumed by this slice" — flag for a  
    decision-log pass to record which PR consumed them; (c) this PRD's own three §0.1  
    decisions (a, b, c) are unlogged and need a decision-log pass; (d) **a cross-repo  
    dependency marker, and two stale claims, are now owed to jerkai** (FM-11, widened  
    2026-08-04 by falsify pass 2, finding B7, blocking): this slice makes jerkai-mcp depend on  
    biometric_readings' schema and the stability of reading_date/unit/source/metric  
    remaining as they are, and nothing in jerkai itself records that a consumer now exists  
    outside its own checkout — the marker-absent half of FM-11. Separately, and this is the  
    marker-_stale_ half FM-11's 2026-07-31 dated note added: jerkai/docs/context.md:52-53  
    ("Neither reports coverage — it holds no credential, opens no database connection, and  
    reports coverage as null rather than guessing") and jerkai/README.md:63 ("It opens no  
    database connection and holds no credential of any kind, and it reads no value out of  
    biometric_readings") both become false on merge. **A third, pre-existing staleness lives  
    in the same jerkai/README.md:63 sentence, unrelated to this slice** (re-verification  
    finding, 2026-08-05): its opening clause, "It ships one tool today,  
    list_available_metrics," has been false since Slice 2 shipped describe_metric  
    (2026-08-03) — not caused by this slice, but worth fixing in the same pass since it is the  
    same line. None of this is this slice's file budget — it is a jerkai-side edit, a  
    different repo — so flag all three (the new marker and the three corrections, with their  
    line citations) in the PR body for a fast-follow, per the ledger's FM-11 remedy ("which  
    files outside this repo does it now constrain, and what in that repo says so");  
    **(e) a second, distinct cross-repo coupling this slice creates is  
    also unmarked on jerkai's side** (FM-11, widened 2026-08-04 by falsify pass 5, finding 2,  
    blocking): scripts/ci/neon-branch.mjs applies jerkai's own migrations/ directory —  
    written for node-pg-migrate's specific API — to a foreign Neon project via that same tool,  
    and neither jerkai/docs/codebase.md's migrations/ row nor jerkai/README.md's "Related  
    repos" section notes that an external consumer of that directory's shape now exists outside  
    this repo. Flag this alongside (d)'s marker and three corrections in the same PR-body  
    fast-follow, not pulled into this slice's own file budget.
7. Workspace cleanliness: git status --porcelain empty, no stray local branches.

---

reconcile: 2026-08-05 — Applied [F1 (E/FM-01, schema-guards.test.ts's 7 sync buildResult()  
call sites added to the async-conversion note and file budget), F2 (D/FM-04, DoD-5 regex  
amended to drop select\s+.+\s+from from its banned-pattern set, AC-CV12(b) and §4  
rewritten with explicit mechanism), F3 (E/G, broken §0.10 and "cover note above"  
cross-references in NFR-G/§0 item 13/AC-CV12(b) fixed to point at AC-CV6's Given clause and  
§7/§8; three "§0 item 5" mis-citations in §7's coverage line and §8 items 1–2 corrected to  
§0 item 13), F4 (I/FM-07, §7 Coverage line rewritten to enumerate all 16 AC-CV ids, naming  
AC-CV1/4/9/10/14a/14b as ACs with no NFR mapping), F5 (F, §4's empty "Required reading"  
list populated with the file:line pointers scattered through §3/§4/§5)]; Overrides: none —  
non-blocking findings 6–8 (src/config.ts:25→24 citation fix, feature.md:30's stale "(expected  
with 1b)" clause, docs/definition-of-ready-and-done.md's "two harnesses" phrasing) not  
addressed this pass, left open for a follow-up reconciliation.