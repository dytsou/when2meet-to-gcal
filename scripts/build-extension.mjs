#!/usr/bin/env node
/**
 * Generate the MAIN-world extension runner from the userscript source.
 * Usage: node scripts/build-extension.mjs [build|check]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const mode = process.argv[2] || "build";
const extensionDir = "extension";
const sourcePath = "when2meet-to-gcal.user.js";
const preamblePath = `${extensionDir}/main-preamble.js`;
const outputPath = `${extensionDir}/main.js`;
const licensePath = "LICENSE";
const extensionLicensePath = `${extensionDir}/LICENSE`;
const manifestPath = `${extensionDir}/manifest.json`;
const expectedMatches = ["https://when2meet.com/*", "https://www.when2meet.com/*"];

function fail(message) {
  console.error(`extension build: ${message}`);
  process.exit(1);
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`${path}: ${error.message}`);
  }
}

function assertManifest(manifest) {
  const expectedKeys = ["content_scripts", "description", "manifest_version", "name", "permissions", "version"];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys)) fail("unexpected manifest surface");
  if (manifest.manifest_version !== 3) fail("manifest_version must be 3");
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage"])) fail("permissions must be [storage]");
  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 2) fail("expected two content scripts");
  const [bridge, runner] = manifest.content_scripts;
  const isExpectedScript = (script, js, world) =>
    JSON.stringify(script.matches) === JSON.stringify(expectedMatches) &&
    JSON.stringify(script.js) === JSON.stringify([js]) &&
    script.run_at === "document_idle" &&
    script.all_frames === false &&
    (world ? script.world === world : !Object.hasOwn(script, "world"));
  if (!isExpectedScript(bridge, "storage-bridge.js")) fail("invalid isolated storage bridge declaration");
  if (!isExpectedScript(runner, "main.js", "MAIN")) fail("invalid MAIN-world runner declaration");
}

function generatedRunner(userscript, preamble) {
  const metadataEnd = userscript.indexOf("// ==/UserScript==");
  if (metadataEnd < 0) fail("userscript metadata terminator not found");
  const source = userscript.slice(userscript.indexOf("\n", metadataEnd) + 1).trimStart();
  return `// Generated from ${sourcePath}; do not edit directly.\n// SPDX-License-Identifier: GPL-3.0-or-later\n\n${preamble.trimEnd()}\n\n${source}`;
}

function preferenceSchema(source, path) {
  const start = source.indexOf("  // <preference-schema>");
  const end = source.indexOf("  // </preference-schema>", start);
  if (start < 0 || end < 0) fail(`${path}: preference schema markers not found`);
  return source.slice(start, end + "  // </preference-schema>".length);
}

if (mode !== "build" && mode !== "check") fail("use build or check");

const userscript = read(sourcePath);
const preamble = read(preamblePath);
const storageBridge = read(`${extensionDir}/storage-bridge.js`);
const expectedRunner = generatedRunner(userscript, preamble);
const license = read(licensePath);
const manifest = JSON.parse(read(manifestPath));
const packageVersion = JSON.parse(read("package.json")).version;
assertManifest(manifest);
if (manifest.version !== packageVersion) fail("manifest version must match package.json");
if (preferenceSchema(preamble, preamblePath) !== preferenceSchema(storageBridge, "extension/storage-bridge.js")) {
  fail("MAIN and isolated preference schemas differ");
}

if (mode === "build") {
  mkdirSync(extensionDir, { recursive: true });
  writeFileSync(outputPath, expectedRunner);
  writeFileSync(extensionLicensePath, license);
  console.log(`built ${outputPath}`);
  process.exit(0);
}

if (read(outputPath) !== expectedRunner) fail(`${outputPath} is stale; run pnpm run extension:build`);
if (read(extensionLicensePath) !== license) fail(`${extensionLicensePath} differs from ${licensePath}`);
console.log("extension package is current");
