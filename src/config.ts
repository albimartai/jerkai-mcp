import { DASHBOARD_METRICS as VENDORED_METRICS } from "./vendor/types.js";

/**
 * A registry entry as this server understands it: a (source, metric) pair
 * naming one biometric axis in jerkai's `biometric_readings` table.
 */
export type MetricDefinition = {
  source: string;
  metric: string;
};

/**
 * The only keys a vendored registry entry may carry. Anything else means the
 * upstream shape moved on and we cannot vouch for what the entry describes.
 */
export const METRIC_DEFINITION_KEYS = ["source", "metric"] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Structural fallback filter (PRD §0.1). We do not keep an allow-list of
 * source names here: that would be a hardcoded metric payload, and it would
 * silently drop legitimately new axes. Instead an entry survives only if it is
 * exactly the (source, metric) pair shape, with both fields populated.
 */
export function isMetricDefinition(value: unknown): value is MetricDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== METRIC_DEFINITION_KEYS.length) return false;
  if (!METRIC_DEFINITION_KEYS.every((key) => keys.includes(key))) return false;
  const entry = value as Record<string, unknown>;
  return isNonEmptyString(entry.source) && isNonEmptyString(entry.metric);
}

/**
 * Filters a raw vendored registry down to the entries this server can describe.
 * An empty or entirely unrecognisable registry yields `{}` rather than throwing
 * (AC-MF5c): a metric-less server is a valid, if unhelpful, answer.
 */
export function buildMetricRegistry(raw: unknown): Record<string, MetricDefinition> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const registry: Record<string, MetricDefinition> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isNonEmptyString(key)) continue;
    if (!isMetricDefinition(value)) continue;
    registry[key] = { source: value.source, metric: value.metric };
  }
  return registry;
}

/**
 * The metric axes this server will admit to, derived at import time from the
 * vendored jerkai registry. Never hand-written.
 */
export const DASHBOARD_METRICS: Record<string, MetricDefinition> =
  buildMetricRegistry(VENDORED_METRICS);
