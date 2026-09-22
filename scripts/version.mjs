#!/usr/bin/env node
/**
 * Keep package.json version and userscript // @version in sync.
 * Usage:
 *   node scripts/version.mjs check   # exit 1 on mismatch (default)
 *   node scripts/version.mjs sync    # write package.json version into user.js
 */
import { readFileSync, writeFileSync } from "node:fs";

const USER_JS = "when2meet-to-gcal.user.js";
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

if (mode === "sync") {
  if (userVersion === pkgVersion) {
    console.log(`already in sync: ${pkgVersion}`);
    process.exit(0);
  }
  const next = userSrc.replace(VERSION_RE, `// @version      ${pkgVersion}`);
  writeFileSync(USER_JS, next);
  console.log(`synced ${USER_JS} @version ${userVersion} → ${pkgVersion}`);
  process.exit(0);
}

if (mode !== "check") {
  console.error(`unknown mode: ${mode} (use check|sync)`);
  process.exit(1);
}

if (userVersion !== pkgVersion) {
  console.error(`version mismatch: package.json=${pkgVersion} ${USER_JS}=${userVersion}`);
  console.error("fix with: pnpm run version:sync");
  process.exit(1);
}

console.log(`versions match: ${pkgVersion}`);
