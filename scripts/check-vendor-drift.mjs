#!/usr/bin/env node
/**
 * Vendor drift check (AC-MF9).
 *
 * Every file under src/vendor/ must be listed in vendor.lock.json and, once
 * its provenance header is stripped, be byte-identical to the upstream file at
 * the locked commit. Compares against a local jerkai checkout so the check
 * works offline and needs no token.
 *
 *   JERKAI_REPO=/path/to/jerkai node scripts/check-vendor-drift.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(repoRoot, "vendor.lock.json");
const vendorDir = join(repoRoot, "src", "vendor");

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const jerkaiRepo = resolve(repoRoot, process.env.JERKAI_REPO ?? "../jerkai");
const base = `${lock.repo}@${lock.sha}`;
const failures = [];

function upstreamContents(upstreamPath) {
  try {
    return execFileSync("git", ["-C", jerkaiRepo, "show", `${lock.sha}:${upstreamPath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `could not read ${upstreamPath} at ${base} from ${jerkaiRepo}: ${error.message.trim()}`,
    );
  }
}

function stripHeader(contents, path) {
  const lines = contents.split("\n");
  const headerLines = lock.headerLines ?? 4;
  const header = lines.slice(0, headerLines);
  if (!header.every((line) => line.startsWith("//"))) {
    failures.push(
      `${path}: expected a ${headerLines}-line // provenance header, got:\n    ${header.join("\n    ")}`,
    );
    return null;
  }
  return lines.slice(headerLines).join("\n");
}

// 1. Nothing unlocked may sit in src/vendor/.
const onDisk = readdirSync(vendorDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
  .map((path) => path.slice(repoRoot.length + 1).split("\\").join("/"));

for (const path of onDisk) {
  if (!(path in lock.files)) {
    failures.push(`${path}: present in src/vendor/ but absent from vendor.lock.json (base ${base})`);
  }
}

// 2. Every locked file must match upstream once its header is stripped.
for (const [localPath, upstreamPath] of Object.entries(lock.files)) {
  let local;
  try {
    local = readFileSync(join(repoRoot, localPath), "utf8");
  } catch {
    failures.push(`${localPath}: locked against ${upstreamPath} at ${base} but missing on disk`);
    continue;
  }

  const stripped = stripHeader(local, localPath);
  if (stripped === null) continue;

  let upstream;
  try {
    upstream = upstreamContents(upstreamPath);
  } catch (error) {
    failures.push(`${localPath}: ${error.message}`);
    continue;
  }

  if (stripped !== upstream) {
    failures.push(
      `${localPath}: diverged from ${upstreamPath} at ${base} ` +
        `(${stripped.length} bytes local vs ${upstream.length} bytes upstream)`,
    );
  }
}

if (failures.length > 0) {
  console.error("Vendor drift detected:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.error(`Vendor files match ${base} (${Object.keys(lock.files).length} checked).`);
