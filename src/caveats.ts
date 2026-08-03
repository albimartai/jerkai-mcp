/**
 * Caveat derivation: the honest half of `list_available_metrics`.
 *
 * A metric list on its own reads as a promise. These strings are what keep a
 * model from over-reading it, and they are emitted on both channels of the
 * tool response so a client that ignores structured output still sees them.
 */

/** The shape `deriveCaveats` needs; the full entry carries more null fields. */
export type CaveatMetricInput = {
  source: string;
  metric: string;
};

/**
 * Vendor-computed scores that are not directly measured quantities. A model
 * comparing these across people or against a raw sensor reading needs to know
 * they are a proprietary composite, not a unit-bearing measurement. This is
 * the single source of truth for "which metrics are vendor-computed" (NFR-E):
 * `describe_metric` derives its `measurement` field from this map rather than
 * hand-maintaining a second list.
 */
export const WHOOP_PROPRIETARY_SCORES: Record<string, string> = {
  recovery_score:
    "recovery_score is Whoop's proprietary Recovery Score, a vendor-computed composite rather than a directly measured quantity. Its inputs and scale are Whoop's own and are not reproducible from the other metrics here.",
  day_strain:
    "day_strain is Whoop's proprietary Cycle Strain score on a fixed 0 to 21 scale, a vendor-computed composite rather than a measured quantity.",
};

export const WHOOP_SOURCE = "whoop";

export const COVERAGE_CAVEAT =
  "This server reports which metrics exist, not their coverage: unit, earliest day, latest day, day count and gap days are not yet reported by this server and come back as null.";

export const NO_NUTRITION_CAVEAT =
  "This server exposes no nutrition or energy-balance data. Calories, macros and intake targets are not available through it.";

export const NO_CAUSE_CAVEAT =
  "These metrics are observational. Any co-movement between two of them is correlation and states no cause.";

export const EMPTY_REGISTRY_CAVEAT =
  "No metrics are registered on this server, so the list above is empty. That reflects the server's configuration, not an absence of data upstream.";

/**
 * Builds the caveat list for a given metric set. Pure and order-stable: the
 * fixed limitations first, then whatever the metric list itself warrants.
 */
export function deriveCaveats(metrics: readonly CaveatMetricInput[]): string[] {
  const caveats: string[] = [COVERAGE_CAVEAT, NO_NUTRITION_CAVEAT, NO_CAUSE_CAVEAT];

  if (metrics.length === 0) {
    caveats.push(EMPTY_REGISTRY_CAVEAT);
    return caveats;
  }

  for (const [metricName, caveat] of Object.entries(WHOOP_PROPRIETARY_SCORES)) {
    const present = metrics.some(
      (entry) => entry.source === WHOOP_SOURCE && entry.metric === metricName,
    );
    if (present) caveats.push(caveat);
  }

  return caveats;
}
