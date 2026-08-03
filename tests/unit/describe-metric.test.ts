// AC-DM2–AC-DM10 (docs/prd/metric-semantics-describe-metric.md)
//
// Design assumption this stub file commits to (PRD §0.2 names this as an
// intentionally unresolved implementation-shape choice): the tool lives at
// `src/tools/describe-metric.ts`, mirroring list-available-metrics.ts's
// TOOL_NAME/TOOL_DESCRIPTION/InputSchema/OutputSchema/buildResult/handle*
// shape, with `buildResult(key: string)` returning the success payload for a
// known key and `handleDescribeMetric(args)` doing the isError branching for
// an unknown one. The hand-authored semantics module is assumed to live at
// `src/metric-semantics.ts` (outside src/tools/ and src/config.ts, per the
// PRD's AC-MF1b-4 placement note) and export `METRIC_SEMANTICS` keyed by the
// same keys as `DASHBOARD_METRICS`. `WHOOP_PROPRIETARY_SCORES` is assumed to
// become an export of `src/caveats.ts` (today it is module-private) so
// `measurement` can be derived from it per NFR-E. None of this is
// implemented yet — every import below is expected to fail until it is.
import { describe, expect, it } from "vitest";

import { WHOOP_PROPRIETARY_SCORES } from "../../src/caveats.js";
import { DASHBOARD_METRICS } from "../../src/config.js";
import { METRIC_SEMANTICS } from "../../src/metric-semantics.js";
import {
  InputSchema,
  OutputSchema,
  TOOL_DESCRIPTION,
  buildResult,
  handleDescribeMetric,
} from "../../src/tools/describe-metric.js";

describe("AC-DM4: registry completeness guard (NFR-F)", () => {
  it("the semantics module's key set equals DASHBOARD_METRICS' exactly, in both directions", () => {
    const semanticsKeys = Object.keys(METRIC_SEMANTICS);
    const registryKeys = Object.keys(DASHBOARD_METRICS);
    const missingFromSemantics = registryKeys.filter((key) => !semanticsKeys.includes(key));
    const orphanedInSemantics = semanticsKeys.filter((key) => !registryKeys.includes(key));

    expect(
      missingFromSemantics,
      `registry key(s) with no semantics entry: ${missingFromSemantics.join(", ")}`,
    ).toEqual([]);
    expect(
      orphanedInSemantics,
      `semantics entry/entries with no matching registry key: ${orphanedInSemantics.join(", ")}`,
    ).toEqual([]);
  });
});

describe("AC-DM2: closed input schema", () => {
  it("is declared strict", () => {
    expect(InputSchema._def.unknownKeys).toBe("strict");
  });

  it("rejects a missing key (the bare/entry case, FM-02)", () => {
    expect(InputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty-string key", () => {
    expect(InputSchema.safeParse({ key: "" }).success).toBe(false);
  });

  it("rejects any extra property", () => {
    expect(InputSchema.safeParse({ key: "bodyFatPct", extra: true }).success).toBe(false);
  });

  it("accepts a well-formed key", () => {
    expect(InputSchema.safeParse({ key: "bodyFatPct" }).success).toBe(true);
  });
});

describe("AC-DM3: closed output schema (success shape)", () => {
  it("declares the root object strict", () => {
    expect(OutputSchema._def.unknownKeys).toBe("strict");
  });

  it("declares role as a closed enum, not a bare string", () => {
    const roleSchema = OutputSchema.shape.role;
    expect(roleSchema._def.typeName).toBe("ZodEnum");
    expect([...roleSchema._def.values].sort()).toEqual(
      ["driver", "guardrail", "north_star", "tracked"].sort(),
    );
  });

  it("declares measurement as a closed enum, not a bare string", () => {
    const measurementSchema = OutputSchema.shape.measurement;
    expect(measurementSchema._def.typeName).toBe("ZodEnum");
    expect([...measurementSchema._def.values].sort()).toEqual(
      ["measured", "vendor_computed"].sort(),
    );
  });

  it("rejects a value outside the role enum", () => {
    const result = buildResult("bodyFatPct");
    expect(OutputSchema.safeParse({ ...result, role: "outcome" }).success).toBe(false);
  });

  it("rejects an extra root property", () => {
    const result = buildResult("bodyFatPct");
    expect(OutputSchema.safeParse({ ...result, extra: 1 }).success).toBe(false);
  });
});

const EXPECTED_ROLE_AND_MEASUREMENT: Array<{
  key: string;
  role: string;
  measurement: string;
}> = [
  { key: "bodyFatPct", role: "north_star", measurement: "measured" },
  { key: "dayStrain", role: "driver", measurement: "vendor_computed" },
  { key: "recoveryScore", role: "guardrail", measurement: "vendor_computed" },
  { key: "leanBodyMass", role: "guardrail", measurement: "measured" },
  { key: "hrv", role: "guardrail", measurement: "measured" },
  { key: "rhr", role: "guardrail", measurement: "measured" },
  { key: "sleepDuration", role: "tracked", measurement: "measured" },
  { key: "weight", role: "tracked", measurement: "measured" },
];

describe("AC-DM5: role and measurement correctness, every registry key", () => {
  it("the fixture above covers every registry key exactly once", () => {
    expect(EXPECTED_ROLE_AND_MEASUREMENT.map((entry) => entry.key).sort()).toEqual(
      Object.keys(DASHBOARD_METRICS).sort(),
    );
  });

  it.each(EXPECTED_ROLE_AND_MEASUREMENT)(
    "$key -> role=$role, measurement=$measurement",
    ({ key, role, measurement }) => {
      const result = buildResult(key);
      expect(result.role).toBe(role);
      expect(result.measurement).toBe(measurement);
    },
  );
});

describe("AC-DM6: unknown key returns a result-level tool error (unit half)", () => {
  it("has isError true, no structuredContent, and names the key plus list_available_metrics", () => {
    const response = handleDescribeMetric({ key: "not_a_real_key" });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toBeUndefined();
    const text = response.content.map((block) => block.text).join("\n");
    expect(text).toContain("not_a_real_key");
    expect(text).toContain("list_available_metrics");
  });

  it("does not throw a protocol-level error for an unknown key", () => {
    expect(() => handleDescribeMetric({ key: "not_a_real_key" })).not.toThrow();
  });
});

describe("AC-DM7: mandatory boundary phrases in the tool description", () => {
  it("names the nutrition boundary verbatim", () => {
    expect(TOOL_DESCRIPTION).toContain("no nutrition or energy-balance data");
  });

  it("names the causal boundary verbatim", () => {
    expect(TOOL_DESCRIPTION).toContain("states no cause");
  });
});

describe("AC-DM8: dual-channel parity for a valid key", () => {
  it("repeats every structured caveat verbatim in the content text", () => {
    const response = handleDescribeMetric({ key: "dayStrain" });
    expect(response.structuredContent).toBeDefined();
    const text = response.content.map((block) => block.text).join("\n");
    for (const caveat of response.structuredContent?.caveats ?? []) {
      expect(text).toContain(caveat);
    }
  });

  it("repeats every structured limitation verbatim in the content text", () => {
    const response = handleDescribeMetric({ key: "dayStrain" });
    expect(response.structuredContent).toBeDefined();
    const text = response.content.map((block) => block.text).join("\n");
    for (const limitation of response.structuredContent?.limitations ?? []) {
      expect(text).toContain(limitation);
    }
  });
});

describe("AC-DM9: vendor-computed limitations reuse the existing WHOOP text (NFR-E)", () => {
  it.each(["dayStrain", "recoveryScore"])(
    "%s's limitations include WHOOP_PROPRIETARY_SCORES' text verbatim, not a paraphrase",
    (key) => {
      const definition = DASHBOARD_METRICS[key];
      expect(definition).toBeDefined();
      const expectedText = WHOOP_PROPRIETARY_SCORES[definition?.metric ?? ""];
      expect(expectedText).toBeDefined();
      const result = buildResult(key);
      expect(result.limitations).toContain(expectedText);
    },
  );
});

describe("AC-DM10: tracked-role limitations state the exclusion", () => {
  it.each(["weight", "sleepDuration"])(
    "%s's limitations include an entry containing 'not part of the driver tree'",
    (key) => {
      const result = buildResult(key);
      expect(
        result.limitations.some((limitation: string) =>
          limitation.includes("not part of the driver tree"),
        ),
      ).toBe(true);
    },
  );

  it("a north_star/driver/guardrail metric with nothing tracked-specific to add may have empty limitations beyond vendor-computed reuse", () => {
    const result = buildResult("hrv");
    expect(
      result.limitations.every((limitation: string) => !limitation.includes("not part of the driver tree")),
    ).toBe(true);
  });
});
