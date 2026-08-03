import { z } from "zod";

import { COVERAGE_CAVEAT, NO_CAUSE_CAVEAT, NO_NUTRITION_CAVEAT, WHOOP_PROPRIETARY_SCORES, WHOOP_SOURCE } from "../caveats.js";
import { DASHBOARD_METRICS, type MetricDefinition } from "../config.js";
import { METRIC_SEMANTICS } from "../metric-semantics.js";
import { DESCRIBE_METRIC_KEY_WHITELIST, assertDomainKeys } from "../schema-guards.js";

export const TOOL_NAME = "describe_metric";

export const TOOL_TITLE = "Describe a biometric metric";

/**
 * The description is load-bearing, same as `list_available_metrics`'s: both
 * mandatory boundary phrases are required verbatim (AC-DM7), for the same
 * reason — a boundary belongs in the description, read before the model
 * decides to call the tool, not only in the payload it gets back.
 */
export const TOOL_DESCRIPTION = [
  "Describe one biometric metric axis: its role in JerkAI's driver tree (north star, driver, guardrail, or tracked but outside the tree), whether it is a directly measured quantity or a vendor-computed composite, and what it cannot tell you.",
  "Call list_available_metrics first to see which keys exist, then pass one of those keys here.",
  "Scope limits: this server holds no nutrition or energy-balance data, so it cannot answer questions about calories, macros or intake.",
  "It reports observations only, and any co-movement between metrics is correlation that states no cause.",
].join(" ");

/** Closed schema: an empty string is rejected, not treated as valid-but-unknown (NFR-A). */
export const InputSchema = z.object({ key: z.string().min(1) }).strict();

export const RoleSchema = z.enum(["north_star", "driver", "guardrail", "tracked"]);
export const MeasurementSchema = z.enum(["measured", "vendor_computed"]);

export const OutputSchema = z
  .object({
    source: z.string().min(1).describe("System the readings originate from, e.g. whoop."),
    metric: z.string().min(1).describe("Metric name as stored, e.g. recovery_score."),
    role: RoleSchema.describe("Where this axis sits in the driver tree."),
    measurement: MeasurementSchema.describe(
      "Whether this is a directly measured quantity or a vendor-computed composite.",
    ),
    description: z.string().min(1).describe("What this metric axis is."),
    limitations: z
      .array(z.string().min(1))
      .describe("Metric-specific facts a caller must carry into any interpretation of this metric."),
    caveats: z
      .array(z.string().min(1))
      .describe("The same global boundary statements list_available_metrics carries."),
  })
  .strict();

export type DescribeMetricResult = z.infer<typeof OutputSchema>;

/** Thrown by `buildResult` for a key with no registry entry or no semantics entry. */
export class UnknownMetricKeyError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Unknown metric key: ${key}`);
    this.name = "UnknownMetricKeyError";
    this.key = key;
  }
}

/** NFR-E: derived from `WHOOP_PROPRIETARY_SCORES`, never a second hand-maintained list. */
function deriveMeasurement(definition: MetricDefinition): z.infer<typeof MeasurementSchema> {
  return definition.source === WHOOP_SOURCE && definition.metric in WHOOP_PROPRIETARY_SCORES
    ? "vendor_computed"
    : "measured";
}

function buildLimitations(
  definition: MetricDefinition,
  measurement: z.infer<typeof MeasurementSchema>,
  role: z.infer<typeof RoleSchema>,
  key: string,
): string[] {
  const limitations: string[] = [];

  if (measurement === "vendor_computed") {
    const vendorLimitation = WHOOP_PROPRIETARY_SCORES[definition.metric];
    if (vendorLimitation) limitations.push(vendorLimitation);
  }

  if (role === "tracked") {
    limitations.push(
      `${key} is not part of the driver tree: it is ingested and shown, but carries no north-star, driver or guardrail role.`,
    );
  }

  return limitations;
}

/**
 * Builds the internal domain payload and validates it twice over, exactly as
 * `list-available-metrics.ts:buildResult` does: the runtime key whitelist
 * first (catches keys a schema might tolerate), then the strict output
 * schema. Throws `UnknownMetricKeyError` for a key with no registry entry.
 */
export function buildResult(key: string): DescribeMetricResult {
  const definition = DASHBOARD_METRICS[key];
  const semantics = METRIC_SEMANTICS[key];

  if (!definition || !semantics) {
    throw new UnknownMetricKeyError(key);
  }

  const measurement = deriveMeasurement(definition);
  const payload = {
    source: definition.source,
    metric: definition.metric,
    role: semantics.role,
    measurement,
    description: semantics.description,
    limitations: buildLimitations(definition, measurement, semantics.role, key),
    caveats: [COVERAGE_CAVEAT, NO_NUTRITION_CAVEAT, NO_CAUSE_CAVEAT],
  };

  assertDomainKeys(payload, DESCRIBE_METRIC_KEY_WHITELIST);
  return OutputSchema.parse(payload);
}

/**
 * Tool handler. A known key emits on both channels, mirroring
 * `list-available-metrics.ts`. An unknown key returns a result-level tool
 * error (`isError: true`, no `structuredContent`) rather than throwing —
 * a protocol-level JSON-RPC error was never the live alternative at this SDK
 * version (PRD §3), and the product requirement is that this be a
 * discoverable, explicit error a client can read.
 */
export function handleDescribeMetric(args: unknown) {
  const { key } = InputSchema.parse(args);

  let result: DescribeMetricResult;
  try {
    result = buildResult(key);
  } catch (error) {
    if (error instanceof UnknownMetricKeyError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Unknown metric key "${error.key}". Call list_available_metrics to see the valid set of keys.`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }

  return {
    content: [
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
      { type: "text" as const, text: [...result.caveats, ...result.limitations].join("\n") },
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
