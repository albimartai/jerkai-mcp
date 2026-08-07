/**
 * AUTO-GENERATED TEST STUB — JerkAI Contract
 * PRD Target: Coverage Values over Read-Only Postgres (Slice 3)
 *
 * DO NOT EDIT test names, AC IDs, or stub assertions during implementation.
 * Implementation code must be written to satisfy these stubs.
 * Editing stubs to fit implementation triggers a blocking finding in jerkai-falsify-diff.
 *
 * Design assumption this stub commits to (PRD §4's SQL/JS boundary names
 * `deriveCoverage` by example but leaves `deriveCaveats`'s new signature
 * unspecified beyond "now aware of the unit-conflict and DB-failure cases"):
 * `deriveCaveats` is extended to accept the already-derived entries (which
 * carry `unit`/`dayCount`, not just `source`/`metric`) plus an optional
 * second `{ coverageUnavailable?: boolean }` argument. A metric with
 * `dayCount > 0 && unit === null` is exactly OQ-1's "zero or more than one
 * distinct unit" case, so no separate conflict flag is threaded through.
 * Existing single-argument `deriveCaveats(metrics)` calls (AC-MF6/7a) keep
 * their current meaning unchanged.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { COVERAGE_CAVEAT, deriveCaveats } from "../../src/caveats.js";
import type { CoverageAggregate } from "../../src/db.js";
import { COVERAGE_QUERY_SQL, queryCoverage } from "../../src/db.js";
import { buildResult as buildDescribeMetricResult } from "../../src/tools/describe-metric.js";
import {
  MetricEntrySchema,
  TOOL_DESCRIPTION,
  deriveCoverage,
} from "../../src/tools/list-available-metrics.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcDir = join(repoRoot, "src");
const rel = (path: string) => path.slice(repoRoot.length + 1);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

describe("AC-CV2a: bare/entry case, pure function", () => {
  it("returns dayCount 0 (not null via a ?? fallback) and null for every other coverage field when rowCount is 0", () => {
    const aggregate: CoverageAggregate = {
      rowCount: 0,
      minDay: null,
      maxDay: null,
      distinctUnits: [],
    };

    const entry = deriveCoverage(aggregate);

    expect(Object.is(entry.dayCount, 0)).toBe(true);
    expect(entry.unit).toBeNull();
    expect(entry.earliestDay).toBeNull();
    expect(entry.latestDay).toBeNull();
    expect(entry.gapDays).toBeNull();
  });
});

describe("AC-CV4: unit conflict resolves to null, never a guess", () => {
  it("returns unit: null when distinctUnits has more than one non-null entry", () => {
    const aggregate: CoverageAggregate = {
      rowCount: 5,
      minDay: "2026-01-01",
      maxDay: "2026-01-05",
      distinctUnits: ["kg", "lb"],
    };

    const entry = deriveCoverage(aggregate);

    expect(entry.unit).toBeNull();
  });

  it("returns unit: null when distinctUnits is empty despite rows existing", () => {
    const aggregate: CoverageAggregate = {
      rowCount: 3,
      minDay: "2026-01-01",
      maxDay: "2026-01-03",
      distinctUnits: [],
    };

    const entry = deriveCoverage(aggregate);

    expect(entry.unit).toBeNull();
  });

  it("deriveCaveats names the specific metric as having an inconsistent recorded unit", () => {
    const caveats = deriveCaveats([
      { source: "fitdays", metric: "weight", unit: null, dayCount: 5 },
    ]);

    const conflictCaveat = caveats.find(
      (caveat) => caveat.includes("weight") && caveat.toLowerCase().includes("unit"),
    );
    expect(conflictCaveat).toBeDefined();
    expect(conflictCaveat?.toLowerCase()).toContain("inconsistent");
  });

  it("does not raise a unit-conflict caveat when unit is resolved (not null)", () => {
    const caveats = deriveCaveats([
      { source: "fitdays", metric: "weight", unit: "kg", dayCount: 5 },
    ]);
    expect(caveats.some((caveat) => caveat.toLowerCase().includes("inconsistent"))).toBe(false);
  });
});

describe("AC-CV5: gapDays arithmetic", () => {
  it.each([
    { minDay: "2026-01-01", maxDay: "2026-01-05", rowCount: 5, expectedGapDays: 0, label: "zero-gap case" },
    { minDay: "2026-01-01", maxDay: "2026-01-10", rowCount: 6, expectedGapDays: 4, label: "multi-gap case" },
    { minDay: "2026-01-01", maxDay: "2026-01-01", rowCount: 1, expectedGapDays: 0, label: "single-row case" },
  ])("$label: gapDays = inclusive day span minus dayCount", ({ minDay, maxDay, rowCount, expectedGapDays }) => {
    const entry = deriveCoverage({ rowCount, minDay, maxDay, distinctUnits: ["kg"] });
    expect(entry.gapDays).toBe(expectedGapDays);
  });

  it("the single-row case yields gapDays 0, not null (Object.is check)", () => {
    const entry = deriveCoverage({
      rowCount: 1,
      minDay: "2026-01-01",
      maxDay: "2026-01-01",
      distinctUnits: ["kg"],
    });
    expect(Object.is(entry.gapDays, 0)).toBe(true);
  });
});

describe("AC-CV6: read-only enforcement, code-level guard", () => {
  const WRITE_KEYWORD_GUARD =
    /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+|drop\s+|alter\s+|truncate\s+)/i;

  it("does not match the real coverage query text exported from src/db.ts", () => {
    expect(WRITE_KEYWORD_GUARD.test(COVERAGE_QUERY_SQL)).toBe(false);
  });

  it("reports a match against a deliberately seeded write fixture (positive control, proving the guard can fail)", () => {
    const fixture = "delete from biometric_readings";
    expect(WRITE_KEYWORD_GUARD.test(fixture)).toBe(true);
  });

  // Scope is src/db.ts only, deliberately not the wider src/ tree (AC-CV6's
  // Given clause, disambiguated 2026-08-05 in the PRD itself): a whole-tree
  // scan would trip on unrelated prose, e.g. src/config.ts's own comment
  // about silently "drop"ping new axes — exactly the false positive an
  // earlier PRD draft made before being narrowed. No test asserts the
  // negative of that here; asserting it would just reintroduce it.
});

describe("AC-CV7: credential and payload isolation", () => {
  it("reads only MCP_DATABASE_URL from process.env, never DATABASE_URL or any other named secret", () => {
    const dbSource = readFileSync(join(srcDir, "db.ts"), "utf8");
    const envReads = [...dbSource.matchAll(/process\.env\.(\w+)/g)].map((match) => match[1]);

    expect(envReads.length).toBeGreaterThan(0);
    expect(new Set(envReads)).toEqual(new Set(["MCP_DATABASE_URL"]));
  });

  it("the query's column list never references raw_payload", () => {
    expect(/raw_payload/i.test(COVERAGE_QUERY_SQL)).toBe(false);
  });

  it("never logs the raw connection error, even though it may embed a credential", async () => {
    const originalUrl = process.env.MCP_DATABASE_URL;
    const secretMarker = "sk_test_marker_should_never_leak";
    process.env.MCP_DATABASE_URL = `postgres://user:${secretMarker}@invalid.invalid/db`; // gitleaks:allow — fake marker, not a real credential
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const aggregates = await queryCoverage([{ source: "whoop", metric: "recovery_score" }]);
      expect(aggregates).toBeNull();

      const loggedText = errorSpy.mock.calls.flat().join(" ");
      expect(loggedText).not.toContain(secretMarker);
    } finally {
      errorSpy.mockRestore();
      if (originalUrl === undefined) delete process.env.MCP_DATABASE_URL;
      else process.env.MCP_DATABASE_URL = originalUrl;
    }
  });
});

describe("AC-CV8: schema stays closed under real values", () => {
  it("keeps the root and metric-item schema strict", () => {
    expect(MetricEntrySchema._def.unknownKeys).toBe("strict");
  });

  it("accepts a populated value for every coverage field", () => {
    const populated = {
      key: "bodyFatPct",
      source: "fitdays",
      metric: "body_fat_pct",
      unit: "%",
      earliestDay: "2026-01-01",
      latestDay: "2026-01-10",
      dayCount: 8,
      gapDays: 2,
    };
    expect(MetricEntrySchema.safeParse(populated).success).toBe(true);
  });

  it("still accepts null for every coverage field (the bare/entry case)", () => {
    const bare = {
      key: "bodyFatPct",
      source: "fitdays",
      metric: "body_fat_pct",
      unit: null,
      earliestDay: null,
      latestDay: null,
      dayCount: null,
      gapDays: null,
    };
    expect(MetricEntrySchema.safeParse(bare).success).toBe(true);
  });

  it("dayCount is no longer literal z.null() — a real number now parses", () => {
    expect(MetricEntrySchema.shape.dayCount.safeParse(5).success).toBe(true);
  });
});

describe("AC-CV10: describe_metric is unchanged", () => {
  it("still includes COVERAGE_CAVEAT byte-identical to its pre-slice text", () => {
    const result = buildDescribeMetricResult("bodyFatPct");
    expect(result.caveats).toContain(COVERAGE_CAVEAT);
    expect(COVERAGE_CAVEAT).toBe(
      "This server reports which metrics exist, not their coverage: unit, earliest day, latest day, day count and gap days are not yet reported by this server and come back as null.",
    );
  });

  it("carries no coverage field anywhere in its response shape", () => {
    const result = buildDescribeMetricResult("bodyFatPct");
    const keys = Object.keys(result);
    for (const forbidden of ["unit", "earliestDay", "latestDay", "dayCount", "gapDays"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("AC-CV12: dependency, import and SQL-keyword guards narrowed, not disabled", () => {
  it("(a) @neondatabase/serverless is imported from src/db.ts and nowhere else under src/", () => {
    const offences: string[] = [];
    for (const path of sourceFiles(srcDir)) {
      walk(parse(path), (node) => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text === "@neondatabase/serverless" &&
          path !== join(srcDir, "db.ts")
        ) {
          offences.push(rel(path));
        }
      });
    }
    expect(offences).toEqual([]);
  });

  it("(a) declares @neondatabase/serverless as a runtime dependency", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies ?? {})).toContain("@neondatabase/serverless");
  });

  it("(b) the amended DoD-5 regex (select...from dropped) admits this slice's own SELECT query", () => {
    const amendedRegex = /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i;
    expect(amendedRegex.test(COVERAGE_QUERY_SQL)).toBe(false);
  });

  it("(b) the amended regex still catches a write-keyword positive control", () => {
    const amendedRegex = /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i;
    expect(amendedRegex.test("delete from biometric_readings")).toBe(true);
  });
});

describe("AC-CV13: coverage query casts on the SQL side, never in JS (unit half)", () => {
  it("projects both date bounds through to_char(..., 'YYYY-MM-DD')", () => {
    expect(/to_char\(\s*min\(reading_date\)/i.test(COVERAGE_QUERY_SQL)).toBe(true);
    expect(/to_char\(\s*max\(reading_date\)/i.test(COVERAGE_QUERY_SQL)).toBe(true);
    expect(COVERAGE_QUERY_SQL).toMatch(/'YYYY-MM-DD'/);
  });

  it("casts count(*) through an explicit ::int, never left for the driver's own bigint parser", () => {
    expect(/count\(\*\)\s*::\s*int\b/i.test(COVERAGE_QUERY_SQL)).toBe(true);
  });
});

describe("AC-CV14a: tool description stays honest about coverage, exported constant", () => {
  it("still contains the nutrition and causal boundary phrases verbatim (AC-MF2 regression)", () => {
    expect(TOOL_DESCRIPTION).toContain("no nutrition or energy-balance data");
    expect(TOOL_DESCRIPTION).toContain("states no cause");
  });

  it("contains no sentence claiming coverage is unavailable or always null", () => {
    expect(TOOL_DESCRIPTION.toLowerCase()).not.toContain("not available yet");
    expect(TOOL_DESCRIPTION.toLowerCase()).not.toContain("returned as null");
  });
});
