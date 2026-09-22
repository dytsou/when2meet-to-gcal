#!/usr/bin/env node
/**
 * Embed src/icons/*.svg into the userscript (Tampermonkey needs a single file).
 * Usage:
 *   node scripts/embed-icon.mjs check   # exit 1 if out of sync (default)
 *   node scripts/embed-icon.mjs sync    # rewrite icon const in user.js
 */
import { readFileSync, writeFileSync } from "node:fs";

const USER_JS = "when2meet-to-gcal.user.js";
const SVG_PATH = "src/icons/calendar-plus.svg";
const CONST_NAME = "CAL_ICON";
// Markers keep the blob out of hand-edits; sync owns the middle.
const START = `  // <embed-icon src="${SVG_PATH}">`;
const END = `  // </embed-icon>`;
const BLOCK_RE = new RegExp(
  `${escapeRe(START)}\\n[\\s\\S]*?\\n${escapeRe(END)}`,
  "m",
);

const mode = process.argv[2] || "check";

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fabSvg(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("<svg")) {
    throw new Error(`${SVG_PATH}: expected <svg> root`);
  }
  // Collapse whitespace so the userscript const stays one line.
  const oneLine = trimmed.replace(/>\s+</g, "><").replace(/\s+/g, " ");
  return oneLine.replace(
    /^<svg\b([^>]*)>/,
    (_, attrs) => {
      let a = attrs;
      if (!/\bwidth=/.test(a)) a += ` width="24"`;
      if (!/\bheight=/.test(a)) a += ` height="24"`;
      if (!/\baria-hidden=/.test(a)) a += ` aria-hidden="true"`;
      return `<svg${a}>`;
    },
  );
}

function blockFromSvg(svgHtml) {
  return `${START}\n  const ${CONST_NAME} = \`${svgHtml}\`;\n${END}`;
}

const svgHtml = fabSvg(readFileSync(SVG_PATH, "utf8"));
const expected = blockFromSvg(svgHtml);
const userSrc = readFileSync(USER_JS, "utf8");
const match = userSrc.match(BLOCK_RE);

if (!match) {
  console.error(`${USER_JS}: missing embed-icon markers for ${SVG_PATH}`);
  console.error(`Expected:\n${START}\n  const ${CONST_NAME} = \`...\`;\n${END}`);
  process.exit(1);
}

if (mode === "sync") {
  if (match[0] === expected) {
    console.log(`already in sync: ${SVG_PATH}`);
    process.exit(0);
  }
  writeFileSync(USER_JS, userSrc.replace(BLOCK_RE, expected));
  console.log(`synced ${CONST_NAME} from ${SVG_PATH}`);
  process.exit(0);
}

if (mode !== "check") {
  console.error(`unknown mode: ${mode} (use check|sync)`);
  process.exit(1);
}

if (match[0] !== expected) {
  console.error(`icon mismatch: ${USER_JS} ≠ ${SVG_PATH}`);
  console.error("fix with: pnpm run icons:sync");
  process.exit(1);
}

console.log(`icon matches: ${SVG_PATH}`);
