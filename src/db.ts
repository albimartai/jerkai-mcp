import { neon } from "@neondatabase/serverless";

/**
 * One (source, metric) pair's raw aggregates, straight off the query. No
 * derived value lives here — dayCount pass-through, gapDays arithmetic, the
 * unit-conflict decision and the zero-row 0-vs-null distinction all happen in
 * `deriveCoverage` (src/tools/list-available-metrics.ts), never here (§4's
 * SQL/JS boundary).
 */
export type CoverageAggregate = {
  rowCount: number;
  minDay: string | null;
  maxDay: string | null;
  distinctUnits: string[];
};

/**
 * One grouped read, scoped to exactly the (source, metric) pairs passed in
 * (OQ-3) — never `select *`, never an unscoped table scan. Every date column
 * is cast through `to_char(..., 'YYYY-MM-DD')` and every count through an
 * explicit `::int` on the SQL side: left to the driver's own type parsers,
 * `date` becomes a local-time JS `Date` and `count(*)` becomes a string,
 * which would shift earliestDay/latestDay by a calendar day depending on the
 * process's TZ and fail `OutputSchema.parse`'s `z.number()` on a successful
 * query (NFR-I). `raw_payload` is never selected (NFR-H).
 */
export const COVERAGE_QUERY_SQL = `
select
  source,
  metric,
  count(*)::int as row_count,
  to_char(min(reading_date), 'YYYY-MM-DD') as min_day,
  to_char(max(reading_date), 'YYYY-MM-DD') as max_day,
  array_agg(distinct unit) filter (where unit is not null) as distinct_units
from biometric_readings
where (source, metric) in (select unnest($1::text[]), unnest($2::text[]))
group by source, metric
`.trim();

/** Keys a raw-aggregate map by its (source, metric) pair. */
export function coverageKey(pair: { source: string; metric: string }): string {
  return `${pair.source}::${pair.metric}`;
}

type CoverageRow = {
  source: string;
  metric: string;
  row_count: number;
  min_day: string | null;
  max_day: string | null;
  distinct_units: string[] | null;
};

/**
 * Lazily initialized: this module holds no client at import time, so
 * `describe_metric` (no DB access at all) is unaffected by this file simply
 * existing (OQ-6).
 */
function getClient() {
  const url = process.env.MCP_DATABASE_URL;
  if (!url) {
    throw new Error("MCP_DATABASE_URL is not set");
  }
  return neon(url);
}

/**
 * Runs the single grouped coverage query. Returns a map of raw aggregates
 * keyed by `coverageKey`, or `null` as the failure sentinel on any error
 * (connection, timeout, or an unset MCP_DATABASE_URL) — this function never
 * throws past its own boundary (§3's failure mode, NFR-I). No thrown or
 * logged message ever contains the connection string (NFR-H).
 */
export async function queryCoverage(
  pairs: readonly { source: string; metric: string }[],
): Promise<Map<string, CoverageAggregate> | null> {
  if (pairs.length === 0) return new Map();

  try {
    const sql = getClient();
    const sources = pairs.map((pair) => pair.source);
    const metrics = pairs.map((pair) => pair.metric);
    const rows = (await sql.query(COVERAGE_QUERY_SQL, [sources, metrics])) as CoverageRow[];

    const result = new Map<string, CoverageAggregate>();
    for (const row of rows) {
      result.set(coverageKey({ source: row.source, metric: row.metric }), {
        rowCount: row.row_count,
        minDay: row.min_day,
        maxDay: row.max_day,
        distinctUnits: row.distinct_units ?? [],
      });
    }
    return result;
  } catch {
    // Never log the caught error itself: it may embed the connection string
    // (e.g. a DNS/auth failure message from the driver). A fixed, credential-
    // free line is all stderr ever carries for this failure (NFR-H).
    console.error("jerkai-mcp: coverage query failed; degrading to null coverage for this call");
    return null;
  }
}
