import { neon } from "@neondatabase/serverless";

/**
 * Seed logic for the disposable-branch integration tier (PRD §4 "New files",
 * §0 item 6). Deliberately writes to `biometric_readings` — the NFR-G
 * read-only guard scopes itself to `src/db.ts`, the server's own runtime
 * connection path, precisely so this test harness can seed its own fixture
 * on the disposable branch (§6's NFR-G note: "the guard's job is the
 * server's own query path, not the test harness that seeds it"). No
 * teardown function: the disposable branch itself is destroyed wholesale
 * after CI's integration + smoke steps both run (scripts/ci/neon-branch.mjs
 * destroy), and `seedCoverageFixture` clears-and-reseeds its own two pairs
 * on every call, so repeated local runs stay idempotent without one. Never
 * run against anything but a disposable jerkai-mcp-ci branch.
 */

const UNIT = "%";

/** A known, deliberately gapped set of rows for (whoop, recovery_score): three consecutive days, a gap, then one more day. */
const RECOVERY_SCORE_ROWS: readonly { day: string; value: number }[] = [
  { day: "2026-01-01", value: 62 },
  { day: "2026-01-02", value: 58 },
  { day: "2026-01-03", value: 71 },
  { day: "2026-01-06", value: 65 },
];

const RECOVERY_SCORE_EARLIEST_DAY = "2026-01-01";
const RECOVERY_SCORE_LATEST_DAY = "2026-01-06";
const RECOVERY_SCORE_DAY_COUNT = RECOVERY_SCORE_ROWS.length;
// Jan 1 through Jan 6 inclusive is a 6-day span; 4 rows exist, so 2 days are gaps.
const RECOVERY_SCORE_GAP_DAYS = 2;

export type CoverageFixture = {
  recoveryScore: {
    dayCount: number;
    earliestDay: string;
    latestDay: string;
    gapDays: number;
    unit: string;
  };
};

function getClient() {
  const url = process.env.MCP_DATABASE_URL;
  if (!url) {
    throw new Error(
      "MCP_DATABASE_URL is not set; the integration fixture needs a writable disposable branch.",
    );
  }
  return neon(url);
}

/** Deletes any pre-existing rows for the two pairs this fixture owns, so re-seeding is idempotent. */
async function clearFixturePairs(sql: ReturnType<typeof getClient>): Promise<void> {
  await sql`delete from biometric_readings where source = 'whoop' and metric = 'recovery_score'`;
  await sql`delete from biometric_readings where source = 'fitdays' and metric = 'weight'`;
}

/**
 * Seeds (whoop, recovery_score) with the gapped fixture above, and leaves
 * (fitdays, weight) with zero rows — AC-CV2b's bare/entry case (a metric
 * registered before its first sync ever ran, FM-02).
 */
export async function seedCoverageFixture(): Promise<CoverageFixture> {
  const sql = getClient();
  await clearFixturePairs(sql);

  for (const row of RECOVERY_SCORE_ROWS) {
    await sql`
      insert into biometric_readings (source, metric, reading_date, value, unit)
      values ('whoop', 'recovery_score', ${row.day}, ${row.value}, ${UNIT})
    `;
  }

  return {
    recoveryScore: {
      dayCount: RECOVERY_SCORE_DAY_COUNT,
      earliestDay: RECOVERY_SCORE_EARLIEST_DAY,
      latestDay: RECOVERY_SCORE_LATEST_DAY,
      gapDays: RECOVERY_SCORE_GAP_DAYS,
      unit: UNIT,
    },
  };
}

