/**
 * Hand-authored driver-tree semantics, one entry per registry key (PRD §0.1).
 *
 * Unlike the registry itself, these facts cannot be vendored: they are prose
 * derived from the Product Brief and `docs/context.md`. `measurement` is
 * deliberately absent from this module — it is derived from
 * `caveats.ts`'s `WHOOP_PROPRIETARY_SCORES` (NFR-E), not hand-written here,
 * so there is exactly one place that says which metrics are vendor-computed.
 *
 * Lives outside `src/tools/` and `src/config.ts` on purpose: both are in
 * `AC-MF1b-4`'s inspected scope, which rejects a hardcoded `(source, metric)`
 * payload. This module's shape (`role`/`description`) never carries that
 * pair, but the location itself is the convention `src/caveats.ts` already
 * set for a hand-authored, per-metric-name map living outside that scope.
 */

export type MetricRole = "north_star" | "driver" | "guardrail" | "tracked";

export type MetricSemanticsEntry = {
  role: MetricRole;
  description: string;
};

/**
 * Completeness with `DASHBOARD_METRICS` (`src/config.ts`) is enforced by
 * `tests/unit/describe-metric.test.ts` (AC-DM4/NFR-F), not assumed here.
 */
export const METRIC_SEMANTICS: Record<string, MetricSemanticsEntry> = {
  bodyFatPct: {
    role: "north_star",
    description:
      "Body fat percentage: the north-star trend this dashboard is built around. The raw daily reading is always shown alongside its rolling average; the average is the decision signal, the raw reading is never hidden or replaced.",
  },
  dayStrain: {
    role: "driver",
    description:
      "Whoop's Day Strain (Cycle Strain): the training driver in the metric tree, describing how demanding the day's training load was.",
  },
  recoveryScore: {
    role: "guardrail",
    description:
      "Whoop's Recovery Score: a guardrail metric summarizing how ready the body is to take on strain.",
  },
  leanBodyMass: {
    role: "guardrail",
    description: "Lean body mass: a guardrail metric watched alongside the body fat % trend.",
  },
  hrv: {
    role: "guardrail",
    description:
      "Heart rate variability: a guardrail metric watched alongside recovery score and lean body mass.",
  },
  rhr: {
    role: "guardrail",
    description:
      "Resting heart rate: a guardrail metric watched alongside recovery score and lean body mass.",
  },
  sleepDuration: {
    role: "tracked",
    description:
      "Sleep duration: ingested and shown, but deliberately outside the driver tree — it carries no north-star, driver or guardrail role in the product.",
  },
  weight: {
    role: "tracked",
    description:
      "Body weight: ingested and shown on the main-stack strip, but deliberately outside the driver tree — it carries no north-star, driver or guardrail role in the product.",
  },
};
