import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const PUBLISH_WORKFLOW = fs.readFileSync(
  new URL("../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);
const CI_WORKFLOW = fs.readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

test("publish workflow separates userscript and Chrome extension deploys", () => {
  assert.match(PUBLISH_WORKFLOW, /jobs:\n\s+validate:/);
  assert.match(PUBLISH_WORKFLOW, /deploy-userscript:\n\s+needs: validate/);
  assert.match(PUBLISH_WORKFLOW, /deploy-chrome-extension:\n\s+needs: \[validate\]/);
  assert.equal(
    (PUBLISH_WORKFLOW.match(/uses: softprops\/action-gh-release@v3/g) || []).length,
    2,
  );
  assert.doesNotMatch(PUBLISH_WORKFLOW, /check-tag/);

  const userscriptDeploy = PUBLISH_WORKFLOW.slice(
    PUBLISH_WORKFLOW.indexOf("  deploy-userscript:"),
    PUBLISH_WORKFLOW.indexOf("  deploy-chrome-extension:"),
  );
  assert.match(userscriptDeploy, /files: when2meet-to-gcal\.user\.js/);
  assert.doesNotMatch(userscriptDeploy, /extension-package|zip -q -r/);

  const extensionDeploy = PUBLISH_WORKFLOW.slice(
    PUBLISH_WORKFLOW.indexOf("  deploy-chrome-extension:"),
  );
  assert.match(PUBLISH_WORKFLOW, /npm run extension:build/);
  assert.match(extensionDeploy, /ARCHIVE="when2meet-to-gcal-chrome-extension-v\$\{VERSION\}\.zip"/);
  assert.match(extensionDeploy, /zip -q -r "\$ARCHIVE" extension/);
  assert.match(extensionDeploy, /unzip -l "\$ARCHIVE" \| grep -F "extension\/manifest\.json"/);
  assert.match(extensionDeploy, /files: \$\{\{ steps\.extension-package\.outputs\.archive \}\}/);
  assert.match(extensionDeploy, /fail_on_unmatched_files: true/);
});

test("pull requests check release packages before running tests", () => {
  assert.match(CI_WORKFLOW, /pull_request:/);
  assert.match(CI_WORKFLOW, /deploy-check:\n\s+name: Check release packages/);
  assert.match(CI_WORKFLOW, /test:\n\s+needs: deploy-check/);
  assert.match(CI_WORKFLOW, /npm run extension:build/);
  assert.match(CI_WORKFLOW, /zip -q -r "\$ARCHIVE" extension/);
  assert.match(CI_WORKFLOW, /unzip -tq "\$ARCHIVE"/);
  assert.match(CI_WORKFLOW, /unzip -l "\$ARCHIVE" \| grep -F "extension\/manifest\.json"/);
});
