#!/usr/bin/env node
/**
 * Stdio smoke test (AC-MF1a, AC-MF3).
 *
 * Spawns the built server as a child process and drives a real JSON-RPC
 * handshake over the pipes. Asserts that stdout carries nothing but complete
 * JSON-RPC frames, that exactly one tool is advertised, and that the tool call
 * returns the expected payload shape. Diagnostics belong on stderr.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(repoRoot, "dist", "server.js");

if (!existsSync(serverPath)) {
  console.error(`smoke: ${serverPath} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const failures = [];
const check = (label, condition, detail = "") => {
  if (condition) {
    console.error(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}${detail ? ` :: ${detail}` : ""}`);
    failures.push(label);
  }
};

const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });

let stdoutBuffer = "";
let stderrBuffer = "";
const messages = [];
const waiters = new Map();

child.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString();
});

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  const lines = stdoutBuffer.split("\n");
  // Anything after the final newline is an incomplete frame; keep buffering.
  stdoutBuffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim() === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      failures.push(`non-JSON line on stdout: ${line.slice(0, 200)} (${error.message})`);
      continue;
    }
    if (parsed.jsonrpc !== "2.0") {
      failures.push(`stdout frame missing jsonrpc 2.0: ${line.slice(0, 200)}`);
    }
    messages.push(parsed);
    const waiter = waiters.get(parsed.id);
    if (waiter) {
      waiters.delete(parsed.id);
      waiter(parsed);
    }
  }
});

function send(frame) {
  child.stdin.write(`${JSON.stringify(frame)}\n`);
}

function request(id, method, params = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      rejectPromise(new Error(`timed out waiting for response to ${method}`));
    }, 10_000);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolvePromise(message);
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

try {
  console.error("smoke: initialize");
  const initialize = await request(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-stdio", version: "0.0.0" },
  });
  check("initialize returns a result", Boolean(initialize.result), JSON.stringify(initialize));
  check(
    "server identifies as jerkai-mcp",
    initialize.result?.serverInfo?.name === "jerkai-mcp",
    JSON.stringify(initialize.result?.serverInfo),
  );

  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  console.error("smoke: tools/list");
  const list = await request(2, "tools/list");
  const tools = list.result?.tools ?? [];
  // AC-DM1: both tools registered, describe_metric included.
  check("exactly two tools advertised", tools.length === 2, `got ${tools.length}`);
  const listAvailableMetricsTool = tools.find((tool) => tool?.name === "list_available_metrics");
  const describeMetricTool = tools.find((tool) => tool?.name === "describe_metric");
  check("tool list_available_metrics is advertised", Boolean(listAvailableMetricsTool));
  check("tool describe_metric is advertised (AC-DM1)", Boolean(describeMetricTool));
  check(
    "description names the nutrition boundary",
    (listAvailableMetricsTool?.description ?? "").includes("no nutrition or energy-balance data"),
  );
  check(
    "description names the causal boundary",
    (listAvailableMetricsTool?.description ?? "").includes("states no cause"),
  );
  check(
    "input schema is closed",
    listAvailableMetricsTool?.inputSchema?.additionalProperties === false,
    JSON.stringify(listAvailableMetricsTool?.inputSchema),
  );
  check(
    "describe_metric description names the nutrition boundary (AC-DM7)",
    (describeMetricTool?.description ?? "").includes("no nutrition or energy-balance data"),
  );
  check(
    "describe_metric description names the causal boundary (AC-DM7)",
    (describeMetricTool?.description ?? "").includes("states no cause"),
  );
  check(
    "describe_metric input schema is closed",
    describeMetricTool?.inputSchema?.additionalProperties === false,
    JSON.stringify(describeMetricTool?.inputSchema),
  );

  console.error("smoke: tools/call");
  const call = await request(3, "tools/call", {
    name: "list_available_metrics",
    arguments: {},
  });
  const structured = call.result?.structuredContent;
  check("tool call is not an error", call.result?.isError !== true, JSON.stringify(call.result));
  check("structuredContent carries metrics", Array.isArray(structured?.metrics));
  check("structuredContent carries caveats", (structured?.caveats?.length ?? 0) > 0);

  // AC-CV9 replaces the pre-slice "every coverage field is null" assertion
  // (PRD "Coverage Values over Read-Only Postgres" §7): coverage is real now.
  // Per AC-CV9's own Given clause, this runs against a seeded disposable
  // branch — so the check compares against the exact fixture values
  // tests/integration/helpers/coverage-fixture.ts seeds, the same fixture
  // AC-CV1 pins in the integration tier. A bare non-null check would pass
  // identically on a gapDays off-by-one or a swapped min/max; this catches
  // it. Requires MCP_DATABASE_URL pointed at that seeded branch — a fresh
  // recovery_score reading in another database will legitimately fail this.
  console.error("smoke: AC-CV9 real coverage over the wire");
  const recoveryScoreEntry = (structured?.metrics ?? []).find(
    (entry) => entry.source === "whoop" && entry.metric === "recovery_score",
  );
  check(
    "AC-CV9: (whoop, recovery_score) matches the known seeded fixture exactly",
    recoveryScoreEntry?.dayCount === 4 &&
      recoveryScoreEntry?.earliestDay === "2026-01-01" &&
      recoveryScoreEntry?.latestDay === "2026-01-06" &&
      recoveryScoreEntry?.gapDays === 2 &&
      recoveryScoreEntry?.unit === "%",
    JSON.stringify(recoveryScoreEntry),
  );

  console.error("smoke: AC-CV14b tool description stays honest about coverage over the wire");
  check(
    "AC-CV14b: list_available_metrics description omits the stale coverage-unavailable claim",
    !(listAvailableMetricsTool?.description ?? "").toLowerCase().includes("not available yet") &&
      !(listAvailableMetricsTool?.description ?? "").toLowerCase().includes("returned as null"),
    listAvailableMetricsTool?.description,
  );

  console.error("smoke: rejecting unexpected arguments");
  const bad = await request(4, "tools/call", {
    name: "list_available_metrics",
    arguments: { unexpected: true },
  });
  check(
    "unexpected arguments are rejected",
    Boolean(bad.error) || bad.result?.isError === true,
    JSON.stringify(bad),
  );

  console.error("smoke: describe_metric with a real argument (AC-DM1)");
  const describeKnown = await request(5, "tools/call", {
    name: "describe_metric",
    arguments: { key: "bodyFatPct" },
  });
  const describeKnownStructured = describeKnown.result?.structuredContent;
  check(
    "describe_metric call is not an error",
    describeKnown.result?.isError !== true,
    JSON.stringify(describeKnown.result),
  );
  check(
    "structuredContent.source matches bodyFatPct's actual pair (argument threading, AC-DM1)",
    describeKnownStructured?.source === "fitdays",
    JSON.stringify(describeKnownStructured),
  );
  check(
    "structuredContent.metric matches bodyFatPct's actual pair (argument threading, AC-DM1)",
    describeKnownStructured?.metric === "body_fat_pct",
    JSON.stringify(describeKnownStructured),
  );
  check(
    "structuredContent.role is north_star for bodyFatPct",
    describeKnownStructured?.role === "north_star",
    JSON.stringify(describeKnownStructured),
  );

  console.error("smoke: describe_metric with an unknown key (AC-DM6)");
  const describeUnknown = await request(6, "tools/call", {
    name: "describe_metric",
    arguments: { key: "not_a_real_key" },
  });
  check(
    "unknown key is a result-level error, not a protocol-level one",
    describeUnknown.result?.isError === true && !describeUnknown.error,
    JSON.stringify(describeUnknown),
  );
  check(
    "unknown-key error has no structuredContent",
    describeUnknown.result?.structuredContent === undefined,
    JSON.stringify(describeUnknown.result),
  );
  check(
    "unknown-key error content names the literal key and list_available_metrics",
    (describeUnknown.result?.content ?? [])
      .map((block) => block.text ?? "")
      .join("\n")
      .includes("not_a_real_key") &&
      (describeUnknown.result?.content ?? [])
        .map((block) => block.text ?? "")
        .join("\n")
        .includes("list_available_metrics"),
    JSON.stringify(describeUnknown.result),
  );

  check("no trailing fragment left on stdout", stdoutBuffer.trim() === "", stdoutBuffer);
  check("startup diagnostics went to stderr", stderrBuffer.includes("listening on stdio"));
} catch (error) {
  failures.push(error.message);
} finally {
  child.stdin.end();
  child.kill();
}

if (failures.length > 0) {
  console.error(`\nsmoke: ${failures.length} check(s) failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.error(`\nsmoke: all checks passed (${messages.length} frames on stdout)`);
