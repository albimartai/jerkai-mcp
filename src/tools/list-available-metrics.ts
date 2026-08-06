import { z } from "zod";

import { deriveCaveats } from "../caveats.js";
import { DASHBOARD_METRICS, type MetricDefinition } from "../config.js";
import { coverageKey, queryCoverage, type CoverageAggregate } from "../db.js";
import { assertDomainKeys } from "../schema-guards.js";

export const TOOL_NAME = "list_available_metrics";

export const TOOL_TITLE = "List available biometric metrics";

/**
 * The description is load-bearing: it is the only thing a model reads before
 * deciding whether this server can answer a question. Both boundary phrases
 * are required verbatim (AC-MF2).
 */
export const TOOL_DESCRIPTION = [
  "List the biometric metric axes this server knows about, with their source system and stored metric name.",
  "Scope limits: this server holds no nutrition or energy-balance data, so it cannot answer questions about calories, macros or intake.",
  "It reports observations only, and any co-movement between metrics is correlation that states no cause.",
  "Coverage detail (unit, earliest/latest day, day count and gap days) reflects real ingested data per metric axis; a metric with no rows yet reports a day count of 0, and every other coverage field is null until this server has something to report.",
].join(" ");

/** No arguments, and no room for any (NFR-A). */
export const InputSchema = z.object({}).strict();

/**
 * One metric axis. `key`, `source` and `metric` come from the vendored
 * registry; the five coverage fields are real once a coverage query
 * succeeds, and null (or, for `dayCount`, 0) when it has nothing to report
 * (§3, §5.2).
 */
export const MetricEntrySchema = z
  .object({
    key: z.string().min(1).describe("Registry key for the metric axis, e.g. bodyFatPct."),
    source: z.string().min(1).describe("System the readings originate from, e.g. whoop."),
    metric: z.string().min(1).describe("Metric name as stored, e.g. recovery_score."),
    unit: z
      .string()
      .min(1)
      .nullable()
      .describe("The single recorded unit, or null if unreported or inconsistent across rows."),
    earliestDay: z.string().nullable().describe("Earliest reading date (YYYY-MM-DD), or null if none."),
    latestDay: z.string().nullable().describe("Latest reading date (YYYY-MM-DD), or null if none."),
    dayCount: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Number of distinct days with a reading. 0 means the query ran and found nothing."),
    gapDays: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Inclusive calendar-day span between earliestDay and latestDay, minus dayCount."),
  })
  .strict();

export const OutputSchema = z
  .object({
    metrics: z.array(MetricEntrySchema).describe("One entry per registered metric axis."),
    caveats: z
      .array(z.string().min(1))
      .describe("Limitations a caller must carry into any interpretation of these metrics."),
  })
  .strict();

export type MetricEntry = z.infer<typeof MetricEntrySchema>;
export type ListAvailableMetricsResult = z.infer<typeof OutputSchema>;

export type CoverageFields = Pick<
  MetricEntry,
  "unit" | "earliestDay" | "latestDay" | "dayCount" | "gapDays"
>;

const ALL_NULL_COVERAGE: CoverageFields = {
  unit: null,
  earliestDay: null,
  latestDay: null,
  dayCount: null,
  gapDays: null,
};

/** Inclusive calendar-day span between two YYYY-MM-DD strings, minus dayCount. */
function computeGapDays(minDay: string, maxDay: string, dayCount: number): number {
  const min = new Date(`${minDay}T00:00:00Z`).getTime();
  const max = new Date(`${maxDay}T00:00:00Z`).getTime();
  const spanDays = Math.round((max - min) / 86_400_000) + 1;
  return spanDays - dayCount;
}

/**
 * Pure: every derived value (the dayCount pass-through, the gapDays
 * arithmetic, the unit-conflict decision, and the zero-row 0-vs-null
 * distinction) is computed here, never in SQL (§4's SQL/JS boundary).
 * `aggregate` is `undefined` when the grouped query returned no row for this
 * pair — which, since the query is a GROUP BY, can only mean zero matching
 * rows (AC-CV2a).
 */
export function deriveCoverage(aggregate: CoverageAggregate | undefined): CoverageFields {
  const rowCount = aggregate?.rowCount ?? 0;
  if (rowCount === 0) {
    // dayCount is a real, honest 0 here — never null via a `??` fallback
    // (§5.2, NFR-J): the query ran and found nothing, a different fact from
    // ALL_NULL_COVERAGE's null, which means no query ran at all.
    return { ...ALL_NULL_COVERAGE, dayCount: 0 };
  }

  const { minDay, maxDay, distinctUnits } = aggregate as CoverageAggregate;
  const unit = distinctUnits.length === 1 ? (distinctUnits[0] ?? null) : null;
  const gapDays = computeGapDays(minDay as string, maxDay as string, rowCount);

  return { unit, earliestDay: minDay, latestDay: maxDay, dayCount: rowCount, gapDays };
}

function toMetricEntry(
  key: string,
  definition: MetricDefinition,
  aggregates: Map<string, CoverageAggregate> | null,
): MetricEntry {
  const coverage =
    aggregates === null ? ALL_NULL_COVERAGE : deriveCoverage(aggregates.get(coverageKey(definition)));

  return {
    key,
    source: definition.source,
    metric: definition.metric,
    ...coverage,
  };
}

/**
 * Builds the internal domain payload and validates it twice over: the runtime
 * key whitelist first (catches keys a schema might tolerate), then the strict
 * output schema. Async since the coverage query is HTTP-based (OQ-6); a
 * query failure degrades every coverage field to null rather than throwing
 * (§3's failure mode, NFR-I).
 */
export async function buildResult(
  registry: Record<string, MetricDefinition> = DASHBOARD_METRICS,
): Promise<ListAvailableMetricsResult> {
  const definitions = Object.values(registry);
  // queryCoverage's own contract is to never throw past its boundary (§3's
  // failure mode) — this catch is a second, structural line of defense
  // against that contract ever being violated by a future regression, so a
  // thrown error (which could embed MCP_DATABASE_URL) never reaches a caller
  // or a logger from here (NFR-H).
  let aggregates: Map<string, CoverageAggregate> | null;
  try {
    aggregates = await queryCoverage(definitions);
  } catch {
    aggregates = null;
  }

  const metrics = Object.entries(registry).map(([key, definition]) =>
    toMetricEntry(key, definition, aggregates),
  );
  const payload = {
    metrics,
    caveats: deriveCaveats(metrics, { coverageUnavailable: aggregates === null }),
  };

  assertDomainKeys(payload);
  return OutputSchema.parse(payload);
}

/**
 * Tool handler. Emits on both channels: `structuredContent` for clients that
 * read the output schema, and text blocks for those that do not. The caveats
 * appear verbatim in the text so they cannot be lost in translation.
 */
export async function handleListAvailableMetrics(args: unknown = {}) {
  InputSchema.parse(args);
  const result = await buildResult();

  return {
    content: [
      { type: "text" as const, text: JSON.stringify(result.metrics, null, 2) },
      { type: "text" as const, text: result.caveats.join("\n") },
    ],
    structuredContent: result,
  };
}

export const toolConfig = {
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
