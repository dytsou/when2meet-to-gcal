import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const PUBLISH_WORKFLOW = fs.readFileSync(
  new URL("../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);

test("publish workflow separates userscript and Chrome extension deploys", () => {
  assert.match(PUBLISH_WORKFLOW, /jobs:\n\s+validate:/);
  assert.match(PUBLISH_WORKFLOW, /deploy-userscript:\n\s+needs: validate/);
  assert.match(PUBLISH_WORKFLOW, /deploy-chrome-extension:\n\s+needs: \[validate, deploy-userscript\]/);
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
