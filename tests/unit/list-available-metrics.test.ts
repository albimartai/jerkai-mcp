import { describe, expect, it } from "vitest";

import { EMPTY_REGISTRY_CAVEAT, NO_CAUSE_CAVEAT, NO_NUTRITION_CAVEAT, deriveCaveats } from "../../src/caveats.js";
import { DASHBOARD_METRICS, buildMetricRegistry } from "../../src/config.js";
import {
  InputSchema,
  TOOL_DESCRIPTION,
  buildResult,
  handleListAvailableMetrics,
} from "../../src/tools/list-available-metrics.js";

const ENTRY_KEYS = [
  "key",
  "source",
  "metric",
  "unit",
  "earliestDay",
  "latestDay",
  "dayCount",
  "gapDays",
];

const NULL_FIELDS = ["unit", "earliestDay", "latestDay", "dayCount", "gapDays"] as const;

describe("AC-MF2: tool description states the boundaries", () => {
  it("names the nutrition boundary verbatim", () => {
    expect(TOOL_DESCRIPTION).toContain("no nutrition or energy-balance data");
  });

  it("names the causal boundary verbatim", () => {
    expect(TOOL_DESCRIPTION).toContain("states no cause");
  });
});

describe("AC-MF1c-3: input rejection", () => {
  it("accepts an empty argument object", () => {
    expect(() => InputSchema.parse({})).not.toThrow();
  });

  it("rejects unexpected arguments", async () => {
    expect(() => InputSchema.parse({ unexpected: true })).toThrow();
    await expect(handleListAvailableMetrics({ unexpected: true })).rejects.toThrow();
  });
});

describe("AC-MF4: metric entry properties and null guarantees", () => {
  // No MCP_DATABASE_URL in the unit tier (OQ-2/§3's failure mode): the
  // coverage query degrades every field to null, exactly as it did pre-slice.
  it("returns one entry per registry metric", async () => {
    const { metrics } = await buildResult();
    expect(metrics).toHaveLength(Object.keys(DASHBOARD_METRICS).length);
    expect(metrics.length).toBeGreaterThan(0);
  });

  it("gives every entry exactly the eight specified keys", async () => {
    const { metrics } = await buildResult();
    for (const entry of metrics) {
      expect(Object.keys(entry).sort()).toEqual([...ENTRY_KEYS].sort());
    }
  });

  it("populates key, source and metric from the vendor registry", async () => {
    const { metrics } = await buildResult();
    for (const entry of metrics) {
      const definition = DASHBOARD_METRICS[entry.key];
      expect(definition).toBeDefined();
      expect(entry.source).toBe(definition?.source);
      expect(entry.metric).toBe(definition?.metric);
    }
  });

  it("leaves every coverage field null without a database to query, with dayCount null rather than 0", async () => {
    const { metrics } = await buildResult();
    for (const entry of metrics) {
      for (const field of NULL_FIELDS) {
        expect(entry[field]).toBeNull();
      }
      expect(entry.dayCount).not.toBe(0);
    }
  });
});

describe("AC-MF5a: dynamic registry derivation", () => {
  it("returns exactly the registry keys, in registry order", async () => {
    const { metrics } = await buildResult();
    expect(metrics.map((entry) => entry.key)).toEqual(Object.keys(DASHBOARD_METRICS));
  });

  it("includes the axes the vendored jerkai registry actually defines", async () => {
    const { metrics } = await buildResult();
    const pairs = metrics.map((entry) => `${entry.source}/${entry.metric}`);
    expect(pairs).toContain("whoop/recovery_score");
    expect(pairs).toContain("whoop/day_strain");
    expect(pairs).toContain("fitdays/body_fat_pct");
  });
});

describe("AC-MF5b: fallback key filtering", () => {
  const mockRegistry = {
    bodyFatPct: { source: "fitdays", metric: "body_fat_pct" },
    // Not a (source, metric) pair: extra key.
    weirdo: { source: "whoop", metric: "hrv", chartColor: "#ff0000" },
    // Not a pair at all.
    yDomainMarginFraction: 0.12,
    someFlag: true,
    nested: { min: 0, max: 21 },
    nothing: null,
    listy: [{ source: "whoop", metric: "hrv" }],
    // Pair-shaped but empty values.
    blank: { source: "", metric: "hrv" },
  };

  it("retains only well-formed metric entries", () => {
    expect(buildMetricRegistry(mockRegistry)).toEqual({
      bodyFatPct: { source: "fitdays", metric: "body_fat_pct" },
    });
  });

  it("keeps the filtered keys out of the tool output", async () => {
    const { metrics } = await buildResult(buildMetricRegistry(mockRegistry));
    expect(metrics.map((entry) => entry.key)).toEqual(["bodyFatPct"]);
  });

  it("tolerates a registry that is not an object at all", () => {
    expect(buildMetricRegistry(null)).toEqual({});
    expect(buildMetricRegistry([{ source: "whoop", metric: "hrv" }])).toEqual({});
  });
});

describe("AC-MF5c: bare/empty registry fallback", () => {
  it("returns no metrics and still returns caveats", async () => {
    const result = await buildResult(buildMetricRegistry({}));
    expect(result.metrics).toEqual([]);
    expect(result.caveats.length).toBeGreaterThan(0);
    expect(result.caveats).toContain(EMPTY_REGISTRY_CAVEAT);
  });
});

describe("AC-MF6: caveat derivation keyed on the metric list", () => {
  it("names recovery_score as Whoop's proprietary score when present", () => {
    const caveats = deriveCaveats([{ source: "whoop", metric: "recovery_score" }]);
    const proprietary = caveats.filter((caveat) => caveat.includes("recovery_score"));
    expect(proprietary).toHaveLength(1);
    expect(proprietary[0]).toContain("proprietary");
    expect(proprietary[0]).toContain("Whoop");
  });

  it("does not raise the Whoop caveat for non-Whoop sources", () => {
    const caveats = deriveCaveats([
      { source: "fitdays", metric: "body_fat_pct" },
      { source: "apple_health", metric: "recovery_score" },
    ]);
    expect(caveats.some((caveat) => caveat.includes("proprietary"))).toBe(false);
    expect(caveats.some((caveat) => caveat.includes("recovery_score"))).toBe(false);
  });

  it("raises the Whoop caveat off the live registry, which includes recovery_score", async () => {
    const { caveats } = await buildResult();
    expect(caveats.some((caveat) => caveat.includes("recovery_score"))).toBe(true);
  });
});

describe("AC-MF7a: mandatory caveat strings", () => {
  // Rewritten (PRD §4, "not just the stale-caveat assertion"): COVERAGE_CAVEAT
  // is no longer in this tool's default caveat list (§5.3) — its "not yet
  // reported by this server" text would now be false. The two boundary
  // caveats are still unconditional; the DB-failure caveat is what the unit
  // tier's no-MCP_DATABASE_URL environment actually exercises (OQ-2).
  it("is non-empty", async () => {
    const { caveats } = await buildResult();
    expect(caveats.length).toBeGreaterThan(0);
  });

  it("always includes the nutrition and causal boundary caveats verbatim", async () => {
    const { caveats } = await buildResult();
    expect(caveats).toContain(NO_NUTRITION_CAVEAT);
    expect(caveats).toContain(NO_CAUSE_CAVEAT);
  });

  it("includes a coverage-unavailable caveat when the coverage query cannot run (no MCP_DATABASE_URL in this tier)", async () => {
    const { caveats } = await buildResult();
    expect(
      caveats.some(
        (caveat) => caveat.toLowerCase().includes("coverage") && caveat.toLowerCase().includes("unavailable"),
      ),
    ).toBe(true);
  });
});

describe("AC-MF7b: dual-channel emission parity", () => {
  it("repeats every structured caveat verbatim in the content text", async () => {
    const response = await handleListAvailableMetrics({});
    const text = response.content.map((block) => block.text).join("\n");
    for (const caveat of response.structuredContent.caveats) {
      expect(text).toContain(caveat);
    }
  });

  it("carries the structured metrics in the content text too", async () => {
    const response = await handleListAvailableMetrics({});
    const [metricsBlock] = response.content;
    expect(JSON.parse(metricsBlock?.text ?? "null")).toEqual(response.structuredContent.metrics);
  });

  it("emits only text blocks", async () => {
    const response = await handleListAvailableMetrics({});
    expect(response.content.every((block) => block.type === "text")).toBe(true);
  });
});
