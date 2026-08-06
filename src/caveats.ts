/**
 * Caveat derivation: the honest half of `list_available_metrics`.
 *
 * A metric list on its own reads as a promise. These strings are what keep a
 * model from over-reading it, and they are emitted on both channels of the
 * tool response so a client that ignores structured output still sees them.
 */

/**
 * The shape `deriveCaveats` needs. `unit`/`dayCount` are optional so the
 * pre-slice call shape (`{ source, metric }` alone, AC-MF6/7a) still type-checks;
 * when present, they are what lets `deriveCaveats` recognize a unit conflict
 * without a second, separately-threaded flag (see the function doc below).
 */
export type CaveatMetricInput = {
  source: string;
  metric: string;
  unit?: string | null;
  dayCount?: number | null;
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

/**
 * Kept byte-identical: `describe_metric` still carries this verbatim in its
 * own hardcoded caveats array (src/tools/describe-metric.ts:113), and its own
 * PRD forbids it from reporting coverage at all. `list_available_metrics`
 * removes this constant from its own default caveat list below (real
 * coverage values make the claim false there) without editing the constant
 * itself — editing it in place would silently falsify describe_metric's
 * caveat instead.
 */
export const COVERAGE_CAVEAT =
  "This server reports which metrics exist, not their coverage: unit, earliest day, latest day, day count and gap days are not yet reported by this server and come back as null.";

export const NO_NUTRITION_CAVEAT =
  "This server exposes no nutrition or energy-balance data. Calories, macros and intake targets are not available through it.";

export const NO_CAUSE_CAVEAT =
  "These metrics are observational. Any co-movement between two of them is correlation and states no cause.";

export const EMPTY_REGISTRY_CAVEAT =
  "No metrics are registered on this server, so the list above is empty. That reflects the server's configuration, not an absence of data upstream.";

/** OQ-2: a coverage-query failure degrades every field to null, plus this. */
export const COVERAGE_UNAVAILABLE_CAVEAT =
  "Coverage was unavailable for this call: the underlying data store could not be reached, so every coverage field below is null rather than a guess.";

/**
 * Builds the caveat list for a given metric set. Pure and order-stable: the
 * fixed limitations first, then whatever the metric list itself warrants.
 *
 * `options.coverageUnavailable` is OQ-2's signal (a DB-failure call). A
 * per-metric unit-conflict caveat (OQ-1) is derived from the entries
 * themselves, not a separately threaded list: an entry with `dayCount > 0`
 * (real data exists) and `unit === null` can only mean the query found zero
 * or more than one distinct recorded unit — the exact condition
 * `deriveCoverage` resolves to `unit: null` in the first place, so no second
 * flag needs to travel alongside it.
 */
export function deriveCaveats(
  metrics: readonly CaveatMetricInput[],
  options: { coverageUnavailable?: boolean } = {},
): string[] {
  const caveats: string[] = [NO_NUTRITION_CAVEAT, NO_CAUSE_CAVEAT];

  if (options.coverageUnavailable) {
    caveats.push(COVERAGE_UNAVAILABLE_CAVEAT);
  }

  if (metrics.length === 0) {
    caveats.push(EMPTY_REGISTRY_CAVEAT);
    return caveats;
  }

  for (const entry of metrics) {
    if (entry.dayCount !== undefined && entry.dayCount !== null && entry.dayCount > 0 && entry.unit === null) {
      caveats.push(
        `${entry.metric} has an inconsistent recorded unit across its rows (or none at all), so its unit is reported as null rather than guessed.`,
      );
    }
  }

  for (const [metricName, caveat] of Object.entries(WHOOP_PROPRIETARY_SCORES)) {
    const present = metrics.some(
      (entry) => entry.source === WHOOP_SOURCE && entry.metric === metricName,
    );
    if (present) caveats.push(caveat);
  }

  return caveats;
}
