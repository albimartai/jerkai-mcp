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
  check("exactly one tool advertised", tools.length === 1, `got ${tools.length}`);
  check("tool is list_available_metrics", tools[0]?.name === "list_available_metrics");
  check(
    "description names the nutrition boundary",
    (tools[0]?.description ?? "").includes("no nutrition or energy-balance data"),
  );
  check(
    "description names the causal boundary",
    (tools[0]?.description ?? "").includes("states no cause"),
  );
  check(
    "input schema is closed",
    tools[0]?.inputSchema?.additionalProperties === false,
    JSON.stringify(tools[0]?.inputSchema),
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
  check(
    "every coverage field is null",
    (structured?.metrics ?? []).every(
      (entry) =>
        entry.unit === null &&
        entry.earliestDay === null &&
        entry.latestDay === null &&
        entry.dayCount === null &&
        entry.gapDays === null,
    ),
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
