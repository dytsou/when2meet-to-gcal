#!/usr/bin/env node
/**
 * Keep package.json version, userscript // @version, and extension manifest in sync.
 * Usage:
 *   node scripts/version.mjs check   # exit 1 on mismatch (default)
 *   node scripts/version.mjs sync    # write package.json version into user.js + manifest
 */
import { readFileSync, writeFileSync } from "node:fs";

const USER_JS = "when2meet-to-gcal.user.js";
const MANIFEST = "extension/manifest.json";
const VERSION_RE = /^\/\/ @version\s+(\S+)\s*$/m;

const mode = process.argv[2] || "check";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const pkgVersion = pkg.version;
if (!pkgVersion || typeof pkgVersion !== "string") {
  console.error("package.json missing string version");
  process.exit(1);
}

const userSrc = readFileSync(USER_JS, "utf8");
const match = userSrc.match(VERSION_RE);
if (!match) {
  console.error(`${USER_JS}: missing // @version header`);
  process.exit(1);
}
const userVersion = match[1];

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const manifestVersion = manifest.version;
if (!manifestVersion || typeof manifestVersion !== "string") {
  console.error(`${MANIFEST}: missing string version`);
  process.exit(1);
}

if (mode === "sync") {
  let changed = false;
  if (userVersion !== pkgVersion) {
    writeFileSync(USER_JS, userSrc.replace(VERSION_RE, `// @version      ${pkgVersion}`));
    console.log(`synced ${USER_JS} @version ${userVersion} → ${pkgVersion}`);
    changed = true;
  }
  if (manifestVersion !== pkgVersion) {
    manifest.version = pkgVersion;
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`synced ${MANIFEST} version ${manifestVersion} → ${pkgVersion}`);
    changed = true;
  }
  if (!changed) console.log(`already in sync: ${pkgVersion}`);
  process.exit(0);
}

if (mode !== "check") {
  console.error(`unknown mode: ${mode} (use check|sync)`);
  process.exit(1);
}

const mismatches = [];
if (userVersion !== pkgVersion) mismatches.push(`${USER_JS}=${userVersion}`);
if (manifestVersion !== pkgVersion) mismatches.push(`${MANIFEST}=${manifestVersion}`);
if (mismatches.length > 0) {
  console.error(`version mismatch: package.json=${pkgVersion} ${mismatches.join(" ")}`);
  console.error("fix with: pnpm run version:sync");
  process.exit(1);
}

console.log(`versions match: ${pkgVersion}`);
