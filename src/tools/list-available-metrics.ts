import { z } from "zod";

import { deriveCaveats } from "../caveats.js";
import { DASHBOARD_METRICS, type MetricDefinition } from "../config.js";
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
  "Coverage detail (unit, date range, day counts) is not available yet and is returned as null.",
].join(" ");

/** No arguments, and no room for any (NFR-A). */
export const InputSchema = z.object({}).strict();

/**
 * One metric axis. `key`, `source` and `metric` come from the vendored
 * registry; the five coverage fields are structurally present but always null
 * in this slice, so a client can bind against the final shape today.
 */
export const MetricEntrySchema = z
  .object({
    key: z.string().min(1).describe("Registry key for the metric axis, e.g. bodyFatPct."),
    source: z.string().min(1).describe("System the readings originate from, e.g. whoop."),
    metric: z.string().min(1).describe("Metric name as stored, e.g. recovery_score."),
    unit: z.null().describe("Always null: units are not reported by this server yet."),
    earliestDay: z.null().describe("Always null: coverage is not reported by this server yet."),
    latestDay: z.null().describe("Always null: coverage is not reported by this server yet."),
    dayCount: z.null().describe("Always null (never 0): coverage is not reported yet."),
    gapDays: z.null().describe("Always null: coverage is not reported by this server yet."),
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

function toMetricEntry(key: string, definition: MetricDefinition): MetricEntry {
  return {
    key,
    source: definition.source,
    metric: definition.metric,
    // Not "unknown" and not 0: this slice has no data access at all, and a 0
    // day count would read as "we looked and found nothing".
    unit: null,
    earliestDay: null,
    latestDay: null,
    dayCount: null,
    gapDays: null,
  };
}

/**
 * Builds the internal domain payload and validates it twice over: the runtime
 * key whitelist first (catches keys a schema might tolerate), then the strict
 * output schema.
 */
export function buildResult(
  registry: Record<string, MetricDefinition> = DASHBOARD_METRICS,
): ListAvailableMetricsResult {
  const metrics = Object.entries(registry).map(([key, definition]) =>
    toMetricEntry(key, definition),
  );
  const payload = { metrics, caveats: deriveCaveats(metrics) };

  assertDomainKeys(payload);
  return OutputSchema.parse(payload);
}

/**
 * Tool handler. Emits on both channels: `structuredContent` for clients that
 * read the output schema, and text blocks for those that do not. The caveats
 * appear verbatim in the text so they cannot be lost in translation.
 */
export function handleListAvailableMetrics(args: unknown = {}) {
  InputSchema.parse(args);
  const result = buildResult();

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
