# jerkai-mcp — Definition of Ready & Done (repo-local standard)

> **Type:** Derived repo-local standard. The parent document is JerkAI's vault-canonical
> **Definition of Ready & Done**, snapshotted in the sibling repo at
> `../jerkai/docs/definition-of-ready-and-done.md`. This file mirrors it for jerkai-mcp,
> where the two repos genuinely differ.
>
> Divergence is earned per item, not assumed. §3 records every item of the parent as
> **CARRIED**, **ADAPTED** or **NOT APPLICABLE** with a reason, so a reader can check the
> mapping rather than guess at it. Where an item is inapplicable only because a later slice
> has not landed, it says *not yet* and names what re-arms it.
>
> **Last updated:** 2026-07-31 (derived from the parent's 2026-07-26 revision).

---

## 1. Session start (every Claude Code build/docs prompt)

CARRIED as-is from the parent (DL-2026-07-18-c). Every build or docs session prompt opens
with an explicit branch-from-fresh-main step, before any other work:

```
git checkout main
git fetch origin --prune
git pull --ff-only
git checkout -b <type>/<short-name>   # e.g. feat/query-metric
```

Do not branch from any existing feature branch, and do not reuse a leftover local branch.
Confirm the new branch's base is current — `git log --oneline -1 main` should match
`origin/main` — before starting work.

## 2. Definition of Ready (entry gate)

A slice is ready to enter development when all of these are true:

- [ ] **Acceptance criteria** are written and testable (Given/When/Then, with stable IDs).
      Ids are this repo's own series: `AC-MF*` for slice 1, and **NFR** is a lettered
      series `NFR-A..NFR-D` that does not continue jerkai's numbering (DL-2026-07-31-a).
- [ ] **Thin vertical slice** — scoped to the smallest end-to-end usable unit; enhancements
      deferred to explicit fast-follows.
- [ ] **Registry and data-source impact identified** — which vendored registry entries the
      slice reads, and whether it needs a re-pin of `src/vendor/` (re-copy, bump `sha` in
      `vendor.lock.json`, re-run the drift check). A slice that would introduce a database
      says so explicitly: that is a scope change with its own PRD, not a config change.
- [ ] **Relevant NFRs identified** for this slice.
- [ ] **Test approach known** — which harness each AC lands in. This repo has two:
      the **node-env Vitest unit suite** (`tests/unit/`, `vitest.config.ts`), which is also
      where the AST and dependency guards live, and the **stdio smoke script**
      (`scripts/smoke-stdio.mjs`), which spawns the built `dist/server.js` and drives a
      real JSON-RPC handshake. An AC about protocol-level behavior — what a client sees on
      `tools/list`, what arrives on stdout — belongs in the smoke script; a unit test
      calling the handler directly does not satisfy it. TDD expected: derive tests from
      the ACs. A slice that first introduces a new harness lands that setup as a separate
      self-contained commit ahead of feature work.
- [ ] **Credential and data exposure considered.** This repo holds no credential and no
      data today, and that is the design of slice 1, not an accident of it. A slice that
      introduces either — a database connection, an API token, a real reading served over
      the protocol — is a scope change requiring its own PRD, and inherits JerkAI's rule
      that no real biometric data is ever reachable from a public surface.
- [ ] **Dependencies / blockers identified** — including which slices, here or in jerkai,
      must ship first.
- [ ] **Reference artifact linked** — for a protocol surface this is the tool contract: the
      tool name, its input and output schema, and the caveats it must carry. There is no
      wireframe because there is no UI.
- [ ] **Dev environment plan clear** — Node 18+ per `package.json#engines`, `npm install`
      (which installs the husky hooks), and `JERKAI_REPO` pointing at a local jerkai
      checkout if the slice touches the vendored files. No database URL, by design
      (`.env.example`).
- [ ] **Verification method known for anything CI cannot reach.** CI here runs the build
      and the smoke script, so the protocol path is covered. What CI does not exercise is
      the server registered in a real MCP client: if a slice's behavior depends on how a
      client presents or calls the tool, name how that will be verified before build.

## 3. Mapping to the parent standard

### Definition of Ready

| Parent item | Here | Why |
|---|---|---|
| Acceptance criteria testable, stable IDs | **CARRIED** | Restated verbatim; only the id series is named (`AC-MF*`, `NFR-A..D`, DL-2026-07-31-a). |
| Thin vertical slice | **CARRIED** | Repo-agnostic delivery principle. |
| Data source & schema impact identified | **ADAPTED** | No `biometric_readings` table and no migrations here. The analogue is which vendored registry entries a slice reads and whether it needs a re-pin. |
| Relevant NFRs identified | **CARRIED** | Unchanged. |
| Test approach known (three tiers) | **ADAPTED** | jerkai has node unit, disposable-Neon integration and jsdom interactive. This repo has the Vitest unit suite and the stdio smoke script. Stated as what exists; no tier invented for a harness that does not exist. |
| Auth/privacy considered | **ADAPTED** | No Auth.js and no data to gate. Restated as credential-and-data exposure: introducing either is a scope change with its own PRD. |
| Dependencies / blockers identified | **CARRIED** | Extended only to name cross-repo blockers. |
| Design / reference artifact linked | **ADAPTED** | No UI. The tool contract — name, schemas, required caveats — is the artifact a build follows. |
| Dev environment plan clear | **ADAPTED** | Neon dev branch and migration plan replaced by Node version, `npm install`, and `JERKAI_REPO`. The absence of a database URL is itself the plan. |
| Production migration plan | **NOT APPLICABLE (not yet)** | No database, so no migration. Re-armed by whichever slice first introduces a database connection; that slice inherits the parent item whole. |
| Verification method for anything CI cannot reach | **ADAPTED** | Same intent. The uncovered surface here is not host routing or deploy-time config but the server as seen by a real MCP client. |

### Definition of Done — baseline

| Parent item | Here | Why |
|---|---|---|
| All ACs met and covered by tests | **ADAPTED** | Same requirement; the harness list is this repo's two, not jerkai's three. |
| CI green | **ADAPTED** | `.github/workflows/ci.yml` runs lint → typecheck → unit → build → stdio smoke. No Neon branch, no component tier. `.github/workflows/vendor-drift.yml` runs the drift check separately. |
| Migrations applied to production | **NOT APPLICABLE (not yet)** | No database and no production deployment. Re-armed by the slice that introduces a database. |
| Production spot-check against the deployed commit | **NOT APPLICABLE** | Nothing is deployed. The server runs locally from `dist/server.js`, spawned by whichever client registers it; there is no live URL to spot-check and no Vercel deployment. |
| Behind auth | **NOT APPLICABLE (not yet)** | There is no credential, no data and no public surface to gate. Folded into the DoR credential-and-data item above. Re-armed by the slice that first serves real readings. |
| Responsive (phone browser) | **NOT APPLICABLE** | No UI of any kind. A stdio JSON-RPC server has no viewport. |
| Shared date key | **NOT APPLICABLE (not yet)** | No dated data passes through this server: every coverage field is `null`. Re-armed by the first slice that reports a date range or day count, which must normalize to the device-local calendar day exactly as jerkai does. |
| Raw-data-preserved | **ADAPTED** | Nothing is stored here, so the storage half does not apply. The reporting half does, and is sharper: **never report a derived or assumed value as if it were measured, and prefer an explicit null over a plausible guess.** That is why `dayCount` is `null` and never `0` — a zero would assert "we looked and found nothing", and this server never looked. |
| Secret hygiene intact | **CARRIED** | No secrets committed; the gitleaks `pre-commit` hook (`.husky/pre-commit`, needs `gitleaks` on PATH) and GitHub secret scanning stay working. `.gitleaks.toml` adds a Postgres/Neon connection-string rule, which is the credential this repo must never acquire by accident. |
| Merged via PR, DoD checklist completed | **CARRIED** | Unchanged. Never direct to `main`. |
| PRD import dropped from `CLAUDE.md` in the same PR | **CARRIED** | Unchanged (DL-2026-07-26-b). A Build PRD is imported into `CLAUDE.md` only while its slice is being built; the shipping PR removes that import. The PRD file stays at `docs/prd/` and stays readable on demand — this drops automatic loading, not availability. `CLAUDE.md` imports durable, every-session context only. |
| Product-truth reconciliation flagged | **CARRIED** | Unchanged, and it reaches further from here: a material change to product facts surfaced in this repo is flagged in the PR for reconciliation into the vault's Product Brief and Decision Log. A session here flags only; the vault edits are a PM step. When the Brief changes, both repos' `docs/context.md` need re-syncing. |
| Authoring vs. deciding | **CARRIED** | §5 below, essentially verbatim. It governs the repo/vault boundary and is repo-agnostic. |

## 4. Definition of Done — baseline (exit gate, every slice)

A slice is done only when all of these are true, in addition to the feature-specific DoD in
its build PRD:

- [ ] **All acceptance criteria met** and demonstrably covered by tests (Vitest unit and
      stdio smoke, as applicable to the AC), authored TDD-style from the ACs.
- [ ] **CI green** — lint, typecheck, unit tests, build, stdio smoke (`ci.yml`), and the
      vendor drift job (`vendor-drift.yml`).
- [ ] **Repo-specific exit criteria, all three:**
      `npm run build && npm run smoke` — the stdio smoke script exits 0 against the built
      server; `npm run vendor:check` exits 0 against the locked commit; and the AST guards
      in `tests/unit/schema-guards.test.ts` pass (no db import, no stdout write, no static
      metric payload, no bare unit literal or SQL under `src/`).
- [ ] **Nothing derived is reported as measured.** Any field the server cannot observe is
      `null`, not a default and not a guess.
- [ ] **No credential and no data introduced** without a PRD that scopes it.
- [ ] **Secret hygiene intact** — no secrets committed; gitleaks pre-commit and GitHub
      secret scanning passing.
- [ ] **Merged via PR** (not direct to `main`), with the DoD checklist completed in the PR.
- [ ] **PRD import dropped from `CLAUDE.md` in the same PR**, for a slice that had one.
- [ ] **Product-truth reconciliation flagged** in the PR summary for any material change to
      product facts, scope, metric roles or a decision. Flag only; never write to the vault.
- [ ] **Workspace clean** — `git status --porcelain` empty, no stray local branches.

## 5. Authoring vs. deciding (Decision Log and Product Brief)

Carried from the parent standard, added there 2026-07-26 (DL-2026-07-26-a).

**Deciding is Albert's** and is not delegable. Every Decision Log entry records his
confirmed judgment. An agent that infers a decision from discussion and logs it has
fabricated product truth.

**Authoring is mechanical** and is delegated. Once Albert has confirmed a decision, a
Cowork PM-side session allocates the `DL-YYYY-MM-DD-x` id, writes the entry in house
format, propagates it to the vault docs named in Affects, and reports which repo snapshots
need re-syncing. Albert reviews the drafted entry before it is appended, and reviews
wording only — the mechanics are already handled.

**The build agent's rule is unchanged.** A repo-scoped Claude Code session still flags only
and never writes to the vault (DL-2026-07-17-a). That constraint is about a coding agent
crossing the boundary, not about who may hold a pen on the PM side. It applies in this
repo exactly as it does in jerkai.

**Three properties make delegated authoring safe.** The log is append-only, so the worst
failure is a visibly wrong new entry rather than corrupted history; reversals are new
entries carrying Supersedes, never edits; and the entry format is rigid enough to check
mechanically. The vault is not version-controlled, which is why the draft-then-approve gate
exists.

## 6. How PRDs use this

Each build PRD assumes the DoR above was satisfied before build started, includes a
feature-specific DoD listing only the criteria tied to its own ACs, and ends that DoD with:
*"Plus the baseline DoD — see `docs/definition-of-ready-and-done.md`."*
