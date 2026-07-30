import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DASHBOARD_METRICS } from "../../src/config.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const vendorDir = join(repoRoot, "src", "vendor");
const lock = JSON.parse(readFileSync(join(repoRoot, "vendor.lock.json"), "utf8"));

const vendorFiles = readdirSync(vendorDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => join(entry.parentPath, entry.name).slice(repoRoot.length + 1));

const jerkaiRepo = resolve(repoRoot, process.env.JERKAI_REPO ?? "../jerkai");

describe("vendor.lock.json", () => {
  it("pins a full commit sha", () => {
    expect(lock.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.repo).toBe("albimartai/jerkai");
  });

  it("declares a four-line provenance header", () => {
    expect(lock.headerLines).toBe(4);
  });

  it("lists every file present in src/vendor/", () => {
    expect(vendorFiles.length).toBeGreaterThan(0);
    expect([...vendorFiles].sort()).toEqual(Object.keys(lock.files).sort());
  });
});

describe("vendored files", () => {
  it.each(vendorFiles)("%s carries exactly a four-line // header", (path) => {
    const lines = readFileSync(join(repoRoot, path), "utf8").split("\n");
    const header = lines.slice(0, 4);
    expect(header.every((line) => line.startsWith("//"))).toBe(true);
    expect(header.join("\n")).toContain(lock.sha);
    expect(header.join("\n")).toContain(lock.files[path]);
    // The fifth line is upstream content, not more header commentary.
    expect(lines[4]?.startsWith("// VENDORED")).toBe(false);
  });

  it("is the actual source of the exported registry", () => {
    const keys = Object.keys(DASHBOARD_METRICS);
    expect(keys.length).toBeGreaterThan(0);
    expect(readFileSync(join(repoRoot, "src/vendor/types.ts"), "utf8")).toContain(keys[0]!);
  });
});

describe("AC-MF9: check-vendor-drift.mjs", () => {
  const available = existsSync(join(jerkaiRepo, ".git"));

  it.skipIf(!available)("exits 0 against the locked commit", () => {
    const result = spawnSync(process.execPath, ["scripts/check-vendor-drift.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, JERKAI_REPO: jerkaiRepo },
    });
    expect(result.stderr).toContain("match");
    expect(result.status).toBe(0);
  });

  it.skipIf(!available)("fails loudly when a vendored file is edited", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `const fs=require('node:fs');const p='src/vendor/strain.ts';const original=fs.readFileSync(p,'utf8');
         fs.writeFileSync(p, original + '\\n// local edit\\n');
         const r=require('node:child_process').spawnSync(process.execPath,['scripts/check-vendor-drift.mjs'],{encoding:'utf8'});
         fs.writeFileSync(p, original);
         process.stderr.write(r.stderr); process.exit(r.status === 0 ? 1 : 0);`,
      ],
      { cwd: repoRoot, encoding: "utf8", env: { ...process.env, JERKAI_REPO: jerkaiRepo } },
    );
    expect(result.stderr).toContain("diverged");
    expect(result.status).toBe(0);
  });
});
