# Contributing

jerkai-mcp is a single-user project, the MCP surface of [JerkAI](https://github.com/albimartai/jerkai).
This doc records the workflow so every session (human or agent) follows the same rails. It
states only what is actually wired up here — this repo's tooling is deliberately lighter
than jerkai's, and the differences are called out where they exist.

## Branching model

- `main` is the shipped server. All work happens on short-lived feature branches cut from
  a freshly pulled `main`, merged back via PR. No direct pushes to `main`.
- Branch names: `<type>/<short-slug>`, e.g. `feat/query-metric`, `docs/repo-foundation`.
- The branch-from-fresh-main sequence is not optional and is written out in
  [docs/definition-of-ready-and-done.md](docs/definition-of-ready-and-done.md) §1.

**Convention, not enforced.** The repository is private, so GitHub branch protection is
unavailable on the current plan — nothing mechanically blocks a direct push to `main` or a
merge with red CI. The rule holds because sessions follow it, not because a server refuses.

## Commits — Conventional Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<optional scope>): <description>`. Common types: `feat`, `fix`, `docs`, `test`,
`refactor`, `chore`, `ci`, `perf`.

**Enforced, not just convention.** As in jerkai, the format is checked locally:
`commitlint.config.mjs` extends `@commitlint/config-conventional`, and the
`.husky/commit-msg` hook runs `npx --no -- commitlint --edit "$1"` on every commit.
`npm install` wires both up, via husky and the `@commitlint/cli` and
`@commitlint/config-conventional` devDependencies (`^21.2.1` and `^21.2.0`). A malformed
commit message is rejected with a non-zero exit and the commit does not land.

## Git hooks

`npm install` installs the husky hooks (`package.json` → `"prepare": "husky"`). There are
two:

| Hook | What it runs | What it does |
|---|---|---|
| `.husky/pre-commit` | `gitleaks git --pre-commit --staged --redact --verbose` | Scans staged changes for secrets and blocks the commit if any are found |
| `.husky/commit-msg` | `npx --no -- commitlint --edit "$1"` | Checks the commit message against Conventional Commits and blocks the commit if it does not parse |

The hook shells out to `gitleaks`, which is **not** an npm dependency and must be on your
PATH (`brew install gitleaks`). Without it the hook fails and the commit is blocked, which
is the intended direction: a missing scanner must not silently become no scanning.

`.gitleaks.toml` extends the default ruleset with a Postgres/Neon connection-string rule,
and allowlists `.env.example` and `vendor.lock.json`. That rule guards the one credential
this repo is designed never to hold — see [AGENTS.md](AGENTS.md).

## Secret hygiene

Never commit a secret of any kind. `.env.example` is the only env file in the repo and
carries no value beyond `JERKAI_REPO`, a local path. There is no `DATABASE_URL` here, and
adding one is a scope change, not a config change.

## Scripts

| Command | What it runs |
|---|---|
| `npm test` | Vitest unit suite (`tests/unit/`), including the dependency, AST and schema guards |
| `npm run build` | tsup bundles `src/server.ts` into `dist/server.js` |
| `npm run smoke` | `scripts/smoke-stdio.mjs` — spawns the built server, drives a real stdio handshake |
| `npm run vendor:check` | `scripts/check-vendor-drift.mjs` — vendored files against the locked commit |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

**Ordering constraint:** `npm run smoke` runs against `dist/server.js` and needs
`npm run build` first — it exits 1 with a clear message if the build output is missing.
`npm run vendor:check` needs a local jerkai checkout; it reads `JERKAI_REPO` and defaults
to `../jerkai`.

See README's Scripts table and the tool contract for what each of these is checking.

## CI

Two workflows, both in `.github/workflows/`:

- **`ci.yml`** — on `pull_request` and on `push` to `main`: `npm ci` → lint → typecheck →
  unit tests → build → `node scripts/smoke-stdio.mjs`.
- **`vendor-drift.yml`** — on `pull_request`, on `push` to `main`, on a weekly `schedule`
  and on `workflow_dispatch`: checks out jerkai alongside and runs the drift check. Read
  the comment at the top of that file for what the job does and does not guarantee; the
  short version is that it catches local edits to `src/vendor/` and cannot detect upstream
  change.

This repo has a PR template (`.github/pull_request_template.md`) and two issue templates
(`.github/ISSUE_TEMPLATE/feature.md`, which carries the DoR gate, and
`.github/ISSUE_TEMPLATE/bug.md`). A PR still carries a summary, the linked issue, the
testing done, and the baseline DoD checklist from
[docs/definition-of-ready-and-done.md](docs/definition-of-ready-and-done.md) — the template
now supplies that checklist rather than this prose, and references the standard rather than
restating it. Strike any item that is genuinely n/a and say why.
