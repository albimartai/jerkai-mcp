import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  TOOL_NAME as DESCRIBE_METRIC_TOOL_NAME,
  handleDescribeMetric,
  toolConfig as describeMetricToolConfig,
} from "./tools/describe-metric.js";
import {
  TOOL_NAME,
  handleListAvailableMetrics,
  toolConfig,
} from "./tools/list-available-metrics.js";

export const SERVER_INFO = {
  name: "jerkai-mcp",
  version: "0.1.0",
} as const;

export function createServer(): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions:
      "Read-only access to the JerkAI biometric metric registry. Call list_available_metrics to discover which axes exist before asking about any of them.",
  });

  server.registerTool(TOOL_NAME, toolConfig, () => handleListAvailableMetrics({}));
  // Threads the client's actual arguments through — unlike the zero-arg
  // handler above, describe_metric takes a `key` and silently hardcoding
  // `{}` here would break every call (PRD §4, the src/server.ts trap).
  server.registerTool(DESCRIBE_METRIC_TOOL_NAME, describeMetricToolConfig, (args) =>
    handleDescribeMetric(args),
  );

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only: stdout carries the JSON-RPC frames (NFR-B).
  console.error(`[${SERVER_INFO.name}] listening on stdio`);
}

main().catch((error: unknown) => {
  console.error(`[${SERVER_INFO.name}] fatal:`, error);
  process.exitCode = 1;
});
