import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('version and public workflow examples are ready for v0.1.3', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  const packageLock = JSON.parse(await text('package-lock.json'));
  const example = await text('examples/github-actions/crawler-readability.yml');

  assert.equal(packageJson.version, '0.1.3');
  assert.equal(packageLock.version, '0.1.3');
  assert.equal(packageLock.packages[''].version, '0.1.3');
  assert.equal((example.match(/@prerenderbuddy\/cli@0\.1\.3/g) || []).length, 3);
  assert.doesNotMatch(example, /@prerenderbuddy\/cli@0\.1\.2/);
});

test('trusted release publishing remains repository-only and protected', async () => {
  const workflow = await text('.github/workflows/publish.yml');

  assert.match(workflow, /release:\s*\n\s+types: \[published\]/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /github\.repository == 'kopachlager\/prerenderbuddy-cli'/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run pack:check/);
  assert.match(workflow, /GITHUB_REF_NAME/);
  assert.match(workflow, /npm publish --provenance --access public/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});
