/**
 * AUTO-GENERATED TEST STUB — JerkAI Contract
 * PRD Target: Coverage Values over Read-Only Postgres (Slice 3)
 *
 * DO NOT EDIT test names, AC IDs, or stub assertions during implementation.
 * Implementation code must be written to satisfy these stubs.
 * Editing stubs to fit implementation triggers a blocking finding in jerkai-falsify-diff.
 *
 * Split from coverage.test.ts because this file mocks `src/db.js` wholesale
 * (§3's failure mode: `queryCoverage` returns a failure sentinel, never
 * throws past its own boundary) — a mock that would defeat coverage.test.ts's
 * real-COVERAGE_QUERY_SQL text-inspection tests (AC-CV6, AC-CV12b, AC-CV13)
 * if it lived in the same module graph.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db.js", () => ({
  COVERAGE_QUERY_SQL: "-- mocked in this file; see coverage.test.ts for real-SQL assertions",
  queryCoverage: vi.fn(),
}));

import { queryCoverage } from "../../src/db.js";
import { buildResult, handleListAvailableMetrics } from "../../src/tools/list-available-metrics.js";

describe("AC-CV3: database failure degrades gracefully", () => {
  afterEach(() => {
    vi.mocked(queryCoverage).mockReset();
  });

  it("the tool call still succeeds (isError is not true) even though the query failed", async () => {
    vi.mocked(queryCoverage).mockResolvedValueOnce(null);

    const response = await handleListAvailableMetrics({});

    expect((response as { isError?: boolean }).isError).not.toBe(true);
  });

  it("every coverage field is null for every metric on a query failure", async () => {
    vi.mocked(queryCoverage).mockResolvedValueOnce(null);

    const result = await buildResult();

    expect(result.metrics.length).toBeGreaterThan(0);
    for (const entry of result.metrics) {
      expect(entry.unit).toBeNull();
      expect(entry.earliestDay).toBeNull();
      expect(entry.latestDay).toBeNull();
      expect(entry.dayCount).toBeNull();
      expect(entry.gapDays).toBeNull();
    }
  });

  it("keeps the registry and the three pre-existing static caveats present", async () => {
    vi.mocked(queryCoverage).mockResolvedValueOnce(null);

    const result = await buildResult();

    expect(result.caveats.some((caveat) => caveat.includes("no nutrition or energy-balance data"))).toBe(
      true,
    );
    expect(result.caveats.some((caveat) => caveat.includes("states no cause"))).toBe(true);
  });

  it("adds a new caveat stating coverage was unavailable this call", async () => {
    vi.mocked(queryCoverage).mockResolvedValueOnce(null);

    const result = await buildResult();

    expect(
      result.caveats.some(
        (caveat) => caveat.toLowerCase().includes("coverage") && caveat.toLowerCase().includes("unavailable"),
      ),
    ).toBe(true);
  });
});

describe("AC-CV7: credential and payload isolation (runtime failure path)", () => {
  afterEach(() => {
    vi.mocked(queryCoverage).mockReset();
  });

  it("never surfaces a credential value in a thrown or logged error", async () => {
    const secretMarker = "sk_test_marker_should_never_leak";
    vi.mocked(queryCoverage).mockImplementationOnce(async () => {
      throw new Error(`connection failed for postgres://user:${secretMarker}@host/db`); // gitleaks:allow — fake marker, not a real credential
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(buildResult()).resolves.toBeDefined();

    const loggedText = errorSpy.mock.calls.flat().join(" ");
    expect(loggedText).not.toContain(secretMarker);

    errorSpy.mockRestore();
  });

  it("still degrades to null coverage everywhere if queryCoverage violates its own never-throw contract", async () => {
    vi.mocked(queryCoverage).mockImplementationOnce(async () => {
      throw new Error("simulated contract violation");
    });

    const result = await buildResult();

    expect(result.metrics.length).toBeGreaterThan(0);
    for (const entry of result.metrics) {
      expect(entry.unit).toBeNull();
      expect(entry.dayCount).toBeNull();
    }
  });
});
