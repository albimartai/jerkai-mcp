---
name: Feature slice
about: A thin vertical slice of work. Must meet the Definition of Ready before build starts.
title: ""
labels: enhancement
---

## What & why

<!-- One paragraph: the outcome for a model calling this server, and the reason it matters now. -->

## Spec

<!-- Link the build PRD in docs/prd/ (or the section of an existing PRD) that defines this slice. -->

## Definition of Ready

Work does not start until every item in the [Definition of Ready](https://github.com/albimartai/jerkai-mcp/blob/main/docs/definition-of-ready-and-done.md#2-definition-of-ready-entry-gate) holds for this slice:

- [ ] Acceptance criteria written and testable (Given/When/Then, stable IDs). Ids are this repo's own series: `AC-MF*` for slice 1, and `NFR` is a lettered series `NFR-A..NFR-D` that does not continue jerkai's numbering (DL-2026-07-31-a)
- [ ] Thin vertical slice — scoped to the smallest end-to-end usable unit; enhancements deferred to explicit fast-follows
- [ ] Registry and data-source impact identified — which vendored registry entries the slice reads, and whether it needs a re-pin of `src/vendor/` (re-copy, bump `sha` in `vendor.lock.json`, re-run the drift check). A slice that would introduce a database says so explicitly: that is a scope change with its own PRD, not a config change
- [ ] Relevant NFRs identified for this slice
- [ ] Test approach known — which harness each AC lands in: the node-env Vitest unit suite (`tests/unit/`), which is also where the AST and dependency guards live, or the stdio smoke script (`scripts/smoke-stdio.mjs`), which spawns the built `dist/server.js` and drives a real JSON-RPC handshake. An AC about protocol-level behavior belongs in the smoke script; a unit test calling the handler directly does not satisfy it. TDD expected. A slice that first introduces a new harness lands that setup as a separate self-contained commit ahead of feature work
- [ ] Credential and data exposure considered. This repo holds no credential and no data today, and that is the design of slice 1, not an accident of it. A slice that introduces either — a database connection, an API token, a real reading served over the protocol — is a scope change requiring its own PRD
- [ ] Dependencies / blockers identified — including which slices, here or in jerkai, must ship first
- [ ] Reference artifact linked — for a protocol surface this is the tool contract: the tool name, its input and output schema, and the caveats it must carry. There is no wireframe because there is no UI
- [ ] Dev environment plan clear — Node 18+ per `package.json#engines`, `npm install` (which installs the husky hooks), and `JERKAI_REPO` pointing at a local jerkai checkout if the slice touches the vendored files. No database URL, by design (`.env.example`)
- [ ] Verification method known for anything CI cannot reach. CI runs the build and the smoke script, so the protocol path is covered. What it does not exercise is the server registered in a real MCP client: if a slice's behavior depends on how a client presents or calls the tool, name how that will be verified before build
- [ ] ~~Production migration plan~~ — **not applicable (not yet)**: no database, so no migration. Re-armed by whichever slice first introduces a database connection (expected with 1b); that slice inherits the parent standard's item whole
