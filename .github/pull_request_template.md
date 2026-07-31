## Summary

<!-- What does this PR do, and why? Link the spec section (PRD ACs) it implements. -->

## Linked issue

<!-- Closes #NN, or "n/a" with a reason. -->

## Testing done

<!-- Unit tests (tests/unit/) added or updated; stdio smoke run; manual verification performed. -->

## Definition of Done

Baseline DoD — every item, from [docs/definition-of-ready-and-done.md](https://github.com/albimartai/jerkai-mcp/blob/main/docs/definition-of-ready-and-done.md):

If an item is genuinely n/a for this PR, strike it through and say why — an unticked box is ambiguous between "not done" and "not applicable", and that ambiguity is what makes a checklist rot.

- [ ] All acceptance criteria met, covered by tests (Vitest unit and stdio smoke, as applicable to the AC), authored TDD-style from the ACs
- [ ] CI green — lint, typecheck, unit tests, build, stdio smoke (`ci.yml`), and the vendor drift job (`vendor-drift.yml`)
- [ ] `npm run build && npm run smoke` — the stdio smoke script exits 0 against the built server
- [ ] `npm run vendor:check` exits 0 against the locked commit
- [ ] The AST guards in `tests/unit/schema-guards.test.ts` pass — no db import, no stdout write, no static metric payload, no bare unit literal or SQL under `src/`
- [ ] Nothing derived is reported as measured — any field the server cannot observe is `null`, not a default and not a guess
- [ ] No credential and no data introduced without a PRD that scopes it
- [ ] Secret hygiene intact — no secrets committed; gitleaks pre-commit and GitHub secret scanning passing
- [ ] Merged via PR (not direct to `main`), with this checklist completed
- [ ] PRD import dropped from `CLAUDE.md` in the same PR, for a slice that had one
- [ ] Product-truth reconciliation flagged in this summary for any material change to product facts, scope, metric roles or a decision (flag only; never write to the vault)
- [ ] Workspace clean — `git status --porcelain` empty, no stray local branches

Feature-specific DoD: see the slice's build PRD in `docs/prd/`.

- [ ] Feature-specific DoD from the slice's PRD completed (or n/a for non-feature PRs)
