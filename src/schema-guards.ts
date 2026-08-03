/**
 * Runtime key whitelisting for the internal domain payload (NFR-D).
 *
 * The MCP SDK hands tool results back through loosely typed plumbing, so a
 * stray property added anywhere in the payload builder would sail through
 * TypeScript and out over the wire. This walker is the backstop: it visits
 * every object key in the domain payload and refuses anything it was not told
 * to expect.
 *
 * Protocol envelope keys (`content`, `isError`, `type`, `text`,
 * `structuredContent`) are deliberately absent from both whitelists below.
 * Pass the domain payload, not the MCP response.
 *
 * There are two whitelists, one per tool, rather than one flat set (PRD
 * §4/§5.6): a single shared set would let a payload that mixed
 * `list_available_metrics` fields with `describe_metric` fields pass, which
 * is a weaker guarantee than NFR-D intends. Nothing here ties a key to a
 * tool implicitly — the caller names which whitelist a payload must satisfy.
 */
export const DOMAIN_KEY_WHITELIST = [
  "metrics",
  "caveats",
  "key",
  "source",
  "metric",
  "unit",
  "earliestDay",
  "latestDay",
  "dayCount",
  "gapDays",
] as const;

export type DomainKey = (typeof DOMAIN_KEY_WHITELIST)[number];

/** `describe_metric`'s own whitelist — deliberately separate from the above. */
export const DESCRIBE_METRIC_KEY_WHITELIST = [
  "source",
  "metric",
  "role",
  "measurement",
  "description",
  "limitations",
  "caveats",
] as const;

export type DescribeMetricDomainKey = (typeof DESCRIBE_METRIC_KEY_WHITELIST)[number];

export class DomainKeyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainKeyViolationError";
  }
}

/**
 * Walks `payload` and throws unless every visited object key is on
 * `whitelist`. Defaults to `DOMAIN_KEY_WHITELIST` (`list_available_metrics`'s
 * payload shape) so every pre-existing single-argument call keeps its
 * current meaning; pass `DESCRIBE_METRIC_KEY_WHITELIST` for that tool's
 * payload instead.
 *
 * Throws if the walk visits zero keys: a validator that silently passes because
 * it never looked at anything is worse than no validator, since it reads as a
 * green check (PRD §5.3).
 *
 * @returns the number of keys visited, for callers that want to assert on it.
 */
export function assertDomainKeys(
  payload: unknown,
  whitelist: readonly string[] = DOMAIN_KEY_WHITELIST,
): number {
  const allowed = new Set<string>(whitelist);
  let visited = 0;

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof node !== "object" || node === null) return;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      visited += 1;
      if (!allowed.has(key)) {
        throw new DomainKeyViolationError(
          `Unwhitelisted key "${key}" at ${path === "" ? "<root>" : path}. ` +
            `Allowed keys: ${whitelist.join(", ")}.`,
        );
      }
      walk(value, path === "" ? key : `${path}.${key}`);
    }
  };

  walk(payload, "");

  if (visited === 0) {
    throw new DomainKeyViolationError(
      "Domain payload validation visited zero keys, so nothing was actually checked.",
    );
  }

  return visited;
}
