import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  DESCRIBE_METRIC_KEY_WHITELIST,
  DOMAIN_KEY_WHITELIST,
  DomainKeyViolationError,
  assertDomainKeys,
} from "../../src/schema-guards.js";
import { buildResult as buildDescribeMetricResult } from "../../src/tools/describe-metric.js";
import {
  InputSchema,
  MetricEntrySchema,
  OutputSchema,
  buildResult,
} from "../../src/tools/list-available-metrics.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcDir = join(repoRoot, "src");

// Narrowed 2026-08-05 (PRD "Coverage Values over Read-Only Postgres", AC-CV12a):
// @neondatabase/serverless is this slice's one admitted dependency, scoped to
// src/db.ts alone. AC-CV12's own test (tests/unit/coverage.test.ts) re-exercises
// that narrower claim directly; this denylist stays the guard against every
// *other* driver/ORM, admitting no wider a hole than the PRD's own §0 item 5.
const DB_PACKAGES = [
  "pg",
  "drizzle-orm",
  "prisma",
  "@prisma/client",
  "better-sqlite3",
  "sqlite3",
  "mysql2",
  "knex",
  "typeorm",
];

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

const ALL_SRC_FILES = sourceFiles(srcDir);
const rel = (path: string) => path.slice(repoRoot.length + 1);

describe("AC-MF1b-1: no database packages in package.json", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  it("declares at least one dependency (so this guard is not vacuous)", () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it.each(DB_PACKAGES)("does not depend on %s", (name) => {
    expect(declared).not.toContain(name);
  });
});

describe("AC-MF1b-2: no database driver imports under src/", () => {
  it("finds source files to inspect", () => {
    expect(ALL_SRC_FILES.length).toBeGreaterThan(0);
  });

  it("has no db/ORM import or require anywhere under src/", () => {
    const offences: string[] = [];

    for (const path of ALL_SRC_FILES) {
      walk(parse(path), (node) => {
        let specifier: string | undefined;

        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          specifier = node.moduleSpecifier.text;
        } else if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          specifier = (node.arguments[0] as ts.StringLiteral).text;
        }

        if (specifier === undefined) return;
        const root = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        if (root && DB_PACKAGES.includes(root)) offences.push(`${rel(path)}: ${specifier}`);
      });
    }

    expect(offences).toEqual([]);
  });
});

describe("AC-MF1b-3: no stdout writes under src/", () => {
  it("has no console.log or process.stdout.write call", () => {
    const offences: string[] = [];

    for (const path of ALL_SRC_FILES) {
      const source = parse(path);
      walk(source, (node) => {
        if (!ts.isCallExpression(node)) return;
        const callee = node.expression.getText(source).replace(/\s+/g, "");
        if (
          callee === "console.log" ||
          callee === "process.stdout.write" ||
          callee.endsWith(".stdout.write")
        ) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          offences.push(`${rel(path)}:${line + 1}: ${callee}`);
        }
      });
    }

    expect(offences).toEqual([]);
  });
});

describe("AC-MF1b-4: no static metric payloads in the registry path", () => {
  const inspected = ALL_SRC_FILES.filter(
    (path) => path.startsWith(join(srcDir, "tools")) || path === join(srcDir, "config.ts"),
  );

  it("inspects both the tools directory and config.ts", () => {
    expect(inspected.length).toBeGreaterThanOrEqual(2);
  });

  it("declares no object literal carrying a metric name", () => {
    const offences: string[] = [];

    for (const path of inspected) {
      const source = parse(path);
      walk(source, (node) => {
        if (!ts.isObjectLiteralExpression(node)) return;
        const named = node.properties
          .filter(ts.isPropertyAssignment)
          .filter((property) => {
            const name = property.name.getText(source).replace(/["']/g, "");
            return name === "source" || name === "metric";
          })
          // A hardcoded payload is one that pins a *literal* value; `metric:
          // definition.metric` is the dynamic derivation we want.
          .filter((property) => ts.isStringLiteral(property.initializer));

        if (named.length > 0) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          offences.push(`${rel(path)}:${line + 1}: ${node.getText(source).slice(0, 80)}`);
        }
      });
    }

    expect(offences).toEqual([]);
  });
});

describe("DoD 5: no hardcoded unit values or SQL under src/", () => {
  const UNIT_LITERALS = new Set(["kg", "lb", "lbs", "%", "bpm", "ms", "hr", "kcal"]);

  it("has no bare measurement-unit string literal outside the vendored files", () => {
    const offences: string[] = [];

    for (const path of ALL_SRC_FILES) {
      if (path.startsWith(join(srcDir, "vendor"))) continue;
      const source = parse(path);
      walk(source, (node) => {
        if (ts.isStringLiteral(node) && UNIT_LITERALS.has(node.text)) {
          offences.push(`${rel(path)}: "${node.text}"`);
        }
      });
    }

    expect(offences).toEqual([]);
  });

  // Narrowed 2026-08-05 (AC-CV12b): select...from dropped from the banned set
  // since this slice's own coverage query in src/db.ts is itself a SELECT.
  // The write-keyword ban for src/db.ts specifically remains AC-CV6's own,
  // separately-defined regex (tests/unit/coverage.test.ts), which never
  // banned SELECT to begin with.
  it("has no SQL write-statement strings", () => {
    const sql = /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i;
    const offences = ALL_SRC_FILES.filter((path) => sql.test(readFileSync(path, "utf8"))).map(rel);
    expect(offences).toEqual([]);
  });
});

describe("AC-MF1c-1: closed input schema", () => {
  it("is declared strict", () => {
    expect(InputSchema._def.unknownKeys).toBe("strict");
  });

  it("rejects any property", () => {
    expect(InputSchema.safeParse({}).success).toBe(true);
    expect(InputSchema.safeParse({ unexpected: true }).success).toBe(false);
  });
});

describe("AC-MF1c-2: closed output schema, root and items", () => {
  it("declares the root object strict", () => {
    expect(OutputSchema._def.unknownKeys).toBe("strict");
  });

  it("declares the metric array item strict", () => {
    expect(MetricEntrySchema._def.unknownKeys).toBe("strict");
    expect(OutputSchema.shape.metrics.element._def.unknownKeys).toBe("strict");
  });

  it("rejects an extra root property", () => {
    expect(OutputSchema.safeParse({ metrics: [], caveats: [], extra: 1 }).success).toBe(false);
  });

  it("rejects an extra metric-entry property", async () => {
    const [entry] = (await buildResult()).metrics;
    expect(MetricEntrySchema.safeParse(entry).success).toBe(true);
    expect(MetricEntrySchema.safeParse({ ...entry, extra: 1 }).success).toBe(false);
  });

  // Was "rejects a non-null coverage field" pre-slice, when dayCount was a
  // literal z.null(). AC-CV8 makes dayCount: 0 a real, honest value now
  // (§5.2) — the schema stays bounded in a different way instead: negative
  // and non-integer day counts are still rejected.
  it("still rejects an out-of-bounds coverage field (negative dayCount)", async () => {
    const [entry] = (await buildResult()).metrics;
    expect(MetricEntrySchema.safeParse({ ...entry, dayCount: -1 }).success).toBe(false);
  });
});

describe("AC-MF8: strict domain payload key whitelisting", () => {
  it("accepts the real payload and visits keys while doing so", async () => {
    const visited = assertDomainKeys(await buildResult());
    expect(visited).toBeGreaterThan(0);
  });

  it("only ever visits whitelisted keys", async () => {
    const seen = new Set<string>();
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(collect);
      if (typeof node !== "object" || node === null) return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        seen.add(key);
        collect(value);
      }
    };
    collect(await buildResult());

    expect(seen.size).toBeGreaterThan(0);
    for (const key of seen) {
      expect(DOMAIN_KEY_WHITELIST).toContain(key);
    }
  });

  it("throws on an unwhitelisted root property", () => {
    expect(() => assertDomainKeys({ metrics: [], caveats: [], unexpectedKey: true })).toThrow(
      DomainKeyViolationError,
    );
  });

  it("throws on an unwhitelisted nested property", async () => {
    const payload = (await buildResult()) as unknown as { metrics: Record<string, unknown>[] };
    payload.metrics[0]!.smuggled = true;
    expect(() => assertDomainKeys(payload)).toThrow(DomainKeyViolationError);
  });

  it("throws when the walk visits zero keys", () => {
    expect(() => assertDomainKeys({})).toThrow(/zero keys/);
    expect(() => assertDomainKeys(null)).toThrow(/zero keys/);
    expect(() => assertDomainKeys([])).toThrow(/zero keys/);
  });

  it("rejects protocol envelope keys, which are not domain keys", () => {
    expect(() => assertDomainKeys({ content: [], structuredContent: {} })).toThrow(
      DomainKeyViolationError,
    );
  });
});

// AC-DM11 (docs/prd/metric-semantics-describe-metric.md). Design assumption
// this stub commits to (PRD §4/§5.6 names the whitelist mechanism as an
// unresolved implementation-shape choice): `assertDomainKeys` gains an
// optional second parameter, the whitelist to check against, defaulting to
// `DOMAIN_KEY_WHITELIST` so every existing single-argument call above keeps
// its current meaning unchanged. `DESCRIBE_METRIC_KEY_WHITELIST` is a new,
// separate export — "a second whitelist/walker pair", the PRD's other named
// option — so `describe_metric`'s payload is never checked against
// `list_available_metrics`'s whitelist or vice versa.
describe("AC-DM11: strict domain payload key whitelisting for describe_metric", () => {
  it("accepts a real describe_metric payload against its own whitelist, and visits keys while doing so", () => {
    const visited = assertDomainKeys(buildDescribeMetricResult("bodyFatPct"), DESCRIBE_METRIC_KEY_WHITELIST);
    expect(visited).toBeGreaterThan(0);
  });

  it("only ever visits keys on describe_metric's own whitelist", () => {
    const seen = new Set<string>();
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(collect);
      if (typeof node !== "object" || node === null) return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        seen.add(key);
        collect(value);
      }
    };
    collect(buildDescribeMetricResult("bodyFatPct"));

    expect(seen.size).toBeGreaterThan(0);
    for (const key of seen) {
      expect(DESCRIBE_METRIC_KEY_WHITELIST).toContain(key);
    }
  });

  it("throws when an unwhitelisted property is injected into a describe_metric payload", () => {
    const payload = { ...buildDescribeMetricResult("bodyFatPct"), smuggled: true };
    expect(() => assertDomainKeys(payload, DESCRIBE_METRIC_KEY_WHITELIST)).toThrow(
      DomainKeyViolationError,
    );
  });

  it("keeps the two whitelists disjoint enough that list_available_metrics' own keys fail describe_metric's whitelist", async () => {
    const payload = await buildResult();
    expect(() => assertDomainKeys(payload, DESCRIBE_METRIC_KEY_WHITELIST)).toThrow(
      DomainKeyViolationError,
    );
  });

  it("does not silently accept a payload mixing both tools' keys, against either tool's own whitelist (closes the §5.6 landmine)", async () => {
    const mixed = { ...(await buildResult()), ...buildDescribeMetricResult("bodyFatPct") };
    expect(() => assertDomainKeys(mixed, DOMAIN_KEY_WHITELIST)).toThrow(DomainKeyViolationError);
    expect(() => assertDomainKeys(mixed, DESCRIBE_METRIC_KEY_WHITELIST)).toThrow(
      DomainKeyViolationError,
    );
  });

  it("existing list_available_metrics calls keep working with no whitelist argument (backward compatible default)", async () => {
    const payload = await buildResult();
    expect(() => assertDomainKeys(payload)).not.toThrow();
  });
});
