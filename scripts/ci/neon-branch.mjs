#!/usr/bin/env node
/**
 * Disposable-Neon-branch harness for the integration test tier (PRD
 * "Coverage Values over Read-Only Postgres" §4, §5 point 6, §0 item 6).
 *
 * Creates a fresh branch inside the jerkai-mcp-ci project (DL-2026-07-28-b)
 * — never jerkai's own project, and never a persistent branch — applies
 * jerkai's migrations to it via JERKAI_REPO, and tears it down again
 * regardless of pass or fail. The project is looked up by name every time
 * rather than a hardcoded id, so a misconfigured secret fails loudly instead
 * of silently drifting onto the wrong project (AC-CV11, §5 point 6).
 *
 * Usage (CI):
 *   node scripts/ci/neon-branch.mjs create   # prints the branch id and the
 *                                             # connection string, migrated
 *   node scripts/ci/neon-branch.mjs destroy <branchId>
 *
 * Requires NEON_API_KEY (a jerkai-mcp-ci-scoped Neon API key, DL-2026-07-28-b
 * — never jerkai's own key, never an org-wide one) and, for `create`,
 * JERKAI_REPO pointing at a local jerkai checkout with migrations/.
 */
import { spawnSync } from "node:child_process";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const TARGET_PROJECT_NAME = "jerkai-mcp-ci";
// The Actions secret is a project-scoped Neon API key (DL-2026-07-28-b): it
// can only ever act within this one project, and a GET /projects (list)
// call 404s under it ("not allowed to perform actions outside the project
// this key is scoped to"). The id itself isn't sensitive — the key is what
// enforces the boundary — so it's named here rather than round-tripped
// through a list-and-filter that this key can't perform. Verified directly
// against the API 2026-08-06: GET /projects/{this id} returns
// name: "jerkai-mcp-ci".
const TARGET_PROJECT_ID = "gentle-term-19470752";

function apiKey() {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error("NEON_API_KEY is not set.");
  return key;
}

async function neonFetch(path, options = {}) {
  const response = await fetch(`${NEON_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Neon API ${path} failed: ${response.status} ${response.statusText} ${body}`);
  }
  return response.status === 204 ? undefined : response.json();
}

/**
 * Verifies the known project id is still actually named jerkai-mcp-ci before
 * this script creates or destroys anything against it (§5 point 6, AC-CV11)
 * — the project-scoped key already can't reach any *other* project, but a
 * renamed or repurposed project under the same id would otherwise pass
 * silently.
 */
export async function findTargetProject() {
  const { project } = await neonFetch(`/projects/${TARGET_PROJECT_ID}`);
  if (project.name !== TARGET_PROJECT_NAME) {
    throw new Error(
      `Project ${TARGET_PROJECT_ID} is named "${project.name}", not "${TARGET_PROJECT_NAME}" — refusing to operate on it.`,
    );
  }
  return project;
}

/**
 * AC-CV11: verifies a connection string actually resolves inside the
 * jerkai-mcp-ci project — never jerkai's own project, never an unrelated
 * one — by checking its host against that project's own branch endpoints.
 */
export async function verifyTargetProject(connectionString) {
  if (!connectionString) return false;
  const project = await findTargetProject();
  const { branches } = await neonFetch(`/projects/${project.id}/branches`);
  const endpointLists = await Promise.all(
    branches.map((branch) => neonFetch(`/projects/${project.id}/branches/${branch.id}/endpoints`)),
  );
  const rawHosts = endpointLists.flatMap((page) => page.endpoints.map((endpoint) => endpoint.host));
  // The endpoints API returns each endpoint's raw host, but a connection
  // string from /connection_uri (and this repo's own MCP_DATABASE_URL
  // convention) uses the pooled host — the same hostname with `-pooler`
  // inserted before the first `.` — so both forms count as this project's.
  const knownHosts = new Set(rawHosts.flatMap((host) => [host, host.replace(/^([^.]+)\./, "$1-pooler.")]));
  const host = new URL(connectionString).hostname;
  return knownHosts.has(host);
}

async function createDisposableBranch(project) {
  const branchName = `ci-coverage-${Date.now()}`;
  const created = await neonFetch(`/projects/${project.id}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name: branchName },
      endpoints: [{ type: "read_write" }],
    }),
  });
  return created.branch;
}

async function connectionStringFor(project, branch) {
  const { uri } = await neonFetch(
    `/projects/${project.id}/connection_uri?branch_id=${branch.id}&database_name=neondb&role_name=neondb_owner`,
  );
  return uri;
}

async function deleteBranch(project, branchId) {
  await neonFetch(`/projects/${project.id}/branches/${branchId}`, { method: "DELETE" });
}

function applyJerkaiMigrations(connectionString) {
  const jerkaiRepo = process.env.JERKAI_REPO ?? "../jerkai";
  const migrationsDir = `${jerkaiRepo}/migrations`;
  // `create()`'s own final output is a single JSON line on stdout (the CI step
  // redirects it straight to a file). node-pg-migrate's own progress output
  // must never share that stream — `stdio: "inherit"` did, and its "Migrating
  // files: ..." line landed ahead of the JSON, corrupting the file the next
  // CI step parses. stderr still inherits, so a real migration failure is
  // still visible in the CI log; only stdout is captured instead.
  const result = spawnSync("npx", ["node-pg-migrate", "up", "--migrations-dir", migrationsDir], {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    throw new Error("Applying jerkai's migrations to the disposable branch failed.");
  }
}

async function create() {
  const project = await findTargetProject();
  const branch = await createDisposableBranch(project);
  try {
    const connectionString = await connectionStringFor(project, branch);
    applyJerkaiMigrations(connectionString);
    console.log(JSON.stringify({ branchId: branch.id, connectionString }));
  } catch (error) {
    await deleteBranch(project, branch.id).catch(() => {});
    throw error;
  }
}

async function destroy(branchId) {
  if (!branchId) throw new Error("Usage: neon-branch.mjs destroy <branchId>");
  const project = await findTargetProject();
  await deleteBranch(project, branchId);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [, , command, arg] = process.argv;
  const run = command === "destroy" ? destroy(arg) : command === "create" ? create() : Promise.reject(
    new Error("Usage: neon-branch.mjs <create|destroy> [branchId]"),
  );
  run.catch((error) => {
    console.error(`neon-branch: ${error.message}`);
    process.exit(1);
  });
}
