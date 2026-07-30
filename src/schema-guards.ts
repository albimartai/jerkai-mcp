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
 * `structuredContent`) are deliberately absent from the whitelist. Pass the
 * domain payload, not the MCP response.
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

export class DomainKeyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainKeyViolationError";
  }
}

const WHITELIST = new Set<string>(DOMAIN_KEY_WHITELIST);

/**
 * Walks `payload` and throws unless every visited object key is whitelisted.
 *
 * Throws if the walk visits zero keys: a validator that silently passes because
 * it never looked at anything is worse than no validator, since it reads as a
 * green check (PRD §5.3).
 *
 * @returns the number of keys visited, for callers that want to assert on it.
 */
export function assertDomainKeys(payload: unknown): number {
  let visited = 0;

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof node !== "object" || node === null) return;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      visited += 1;
      if (!WHITELIST.has(key)) {
        throw new DomainKeyViolationError(
          `Unwhitelisted key "${key}" at ${path === "" ? "<root>" : path}. ` +
            `Allowed keys: ${DOMAIN_KEY_WHITELIST.join(", ")}.`,
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
