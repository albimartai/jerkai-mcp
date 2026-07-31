# Branch protection for `main`

These settings require repo-admin access on GitHub and must be applied by the repo owner (a build session cannot change repo settings). Run once with the [GitHub CLI](https://cli.github.com/) authenticated as `albimartai`:

```bash
gh api --method PUT repos/albimartai/jerkai-mcp/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test", "vendor-drift"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

What this enforces:

- **PRs only** — no direct pushes to `main` (applies to admins too, via `enforce_admins`).
- **Required review** — 1 approving review per PR. (Single-owner repo: GitHub does not count self-approval, so this makes merges deliberate via admin merge; drop `required_pull_request_reviews` to `null` if it proves too much friction solo.)
- **CI must pass** — **both** jobs are required status checks: `test`, the job in `.github/workflows/ci.yml` (lint → typecheck → unit → build → stdio smoke), and `vendor-drift`, the job in `.github/workflows/vendor-drift.yml`. A status-check context is the job key, and neither job overrides it with a `name:`. Requiring only `test` would let a PR merge with the vendored registry diverged from the locked commit, which is the one thing the second workflow exists to catch.
- **Branch up to date** — `strict: true` requires the PR branch to be current with `main` before merge.
- **No force pushes or branch deletion** on `main`.

Verify with:

```bash
gh api repos/albimartai/jerkai-mcp/branches/main/protection | jq '{checks: .required_status_checks, reviews: .required_pull_request_reviews.required_approving_review_count, admins: .enforce_admins.enabled}'
```

Click-path alternative: repo → Settings → Branches → Add branch protection rule → pattern `main` → check "Require a pull request before merging" (1 approval), "Require status checks to pass" (select **both** `test` and `vendor-drift`, check "Require branches to be up to date"), "Do not allow bypassing the above settings".

## Secret scanning and push protection

Also repo settings, also admin-only, and named by the baseline DoD's secret-hygiene item — neither is a file, so neither can be committed.

Click path: repo → Settings → Code security → enable **Secret scanning**, then enable **Push protection** under it.

The local gitleaks `pre-commit` hook (`.husky/pre-commit`, with `.gitleaks.toml`'s Postgres/Neon connection-string rule) is only half the guard: it is the half a single `git commit --no-verify` bypasses, and it does not exist at all for a commit pushed from anywhere the hooks were never installed. Push protection runs server-side on the receiving end, so it holds when the local hook is skipped. That is why the setting matters independently of the hook, not as a duplicate of it.
