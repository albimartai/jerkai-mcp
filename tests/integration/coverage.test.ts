/**
 * AUTO-GENERATED TEST STUB — JerkAI Contract
 * PRD Target: Coverage Values over Read-Only Postgres (Slice 3)
 *
 * DO NOT EDIT test names, AC IDs, or stub assertions during implementation.
 * Implementation code must be written to satisfy these stubs.
 * Editing stubs to fit implementation triggers a blocking finding in jerkai-falsify-diff.
 *
 * Tier: Integration — disposable Neon branch (PRD §7). Wired into
 * `vitest.config.ts`'s `integration` project; `npm test` runs this alongside
 * the unit project. Needs MCP_DATABASE_URL pointed at a writable branch — a
 * disposable jerkai-mcp-ci branch in CI (scripts/ci/neon-branch.mjs), or a
 * local dev branch.
 *
 * Build-session note (2026-08-06, post falsify-diff): the original stub's
 * `afterAll(() => teardownCoverageFixture(fixture))` was removed, not any
 * `it`/`expect` body above. Reason: this file's own CI step is followed by
 * the stdio smoke test (AC-CV9) against the *same* branch, which needs the
 * fixture rows still present — CI's own `neon-branch.mjs destroy` step
 * discards the whole branch afterward, so per-test cleanup here would only
 * race that and starve the smoke step. `seedCoverageFixture` clears-and-
 * reseeds its own two pairs on every run, so repeated local runs stay
 * idempotent without an explicit teardown either.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { buildResult } from "../../src/tools/list-available-metrics.js";
import type { CoverageFixture } from "./helpers/coverage-fixture.js";
import { seedCoverageFixture } from "./helpers/coverage-fixture.js";

let fixture: CoverageFixture;

beforeAll(async () => {
  if (!process.env.MCP_DATABASE_URL) {
    throw new Error(
      "AC-CV1/AC-CV2b/AC-CV11/AC-CV13 (integration): MCP_DATABASE_URL must point at a " +
        "disposable jerkai-mcp-ci branch seeded by scripts/ci/neon-branch.mjs. Not set.",
    );
  }
  fixture = await seedCoverageFixture();
});

describe("AC-CV1: real coverage for a populated metric", () => {
  it("matches the seeded, deliberately gapped fixture exactly for (whoop, recovery_score)", async () => {
    const { metrics } = await buildResult();
    const entry = metrics.find((metric) => metric.source === "whoop" && metric.metric === "recovery_score");

    expect(entry).toBeDefined();
    expect(entry?.dayCount).toBe(fixture.recoveryScore.dayCount);
    expect(entry?.earliestDay).toBe(fixture.recoveryScore.earliestDay);
    expect(entry?.latestDay).toBe(fixture.recoveryScore.latestDay);
    expect(entry?.gapDays).toBe(fixture.recoveryScore.gapDays);
    expect(entry?.unit).toBe(fixture.recoveryScore.unit);
  });
});

describe("AC-CV2b: bare/entry case, end-to-end", () => {
  it("returns dayCount 0 (not null) for a seeded-empty pair, while another seeded pair returns real values", async () => {
    const { metrics } = await buildResult();
    const bareEntry = metrics.find((metric) => metric.source === "fitdays" && metric.metric === "weight");

    expect(bareEntry).toBeDefined();
    expect(Object.is(bareEntry?.dayCount, 0)).toBe(true);
    expect(bareEntry?.unit).toBeNull();
    expect(bareEntry?.earliestDay).toBeNull();
    expect(bareEntry?.latestDay).toBeNull();
    expect(bareEntry?.gapDays).toBeNull();

    const populatedEntry = metrics.find(
      (metric) => metric.source === "whoop" && metric.metric === "recovery_score",
    );
    expect(populatedEntry?.dayCount).toBeGreaterThan(0);
  });
});

describe("AC-CV11: disposable-branch harness isolation", () => {
  it("the CI job's seeded connection points at a freshly created jerkai-mcp-ci branch, never jerkai's own project", async () => {
    const { verifyTargetProject } = await import("../../scripts/ci/neon-branch.mjs");
    await expect(verifyTargetProject(process.env.MCP_DATABASE_URL)).resolves.toBe(true);
  });
});

describe("AC-CV13: coverage query casts on the SQL side, never in JS (integration half)", () => {
  it("earliestDay/latestDay are YYYY-MM-DD strings and dayCount is a number, unaffected by the process's TZ", async () => {
    const { metrics } = await buildResult();
    const entry = metrics.find((metric) => metric.source === "whoop" && metric.metric === "recovery_score");

    expect(entry?.earliestDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry?.latestDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof entry?.dayCount).toBe("number");
  });
});
