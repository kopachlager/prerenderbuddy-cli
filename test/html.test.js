import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzeHtml, buildHtmlIssues, stripTags } from '../src/html.js';

async function fixture(name) {
  return readFile(new URL(`./fixtures/html/${name}`, import.meta.url), 'utf8');
}

test('extracts crawler-readable page signals', () => {
  const html = `<!doctype html>
    <html><head>
      <title>Useful page</title>
      <meta name="description" content="A useful description">
      <link href="https://example.com/page" rel="canonical">
    </head><body>
      <h1>Primary heading</h1>
      <h2>Details</h2>
      <p>${'Useful readable content '.repeat(30)}</p>
      <script>window.test = true</script>
    </body></html>`;
  const result = analyzeHtml(html);

  assert.equal(result.title, 'Useful page');
  assert.equal(result.description, 'A useful description');
  assert.equal(result.canonicalUrl, 'https://example.com/page');
  assert.deepEqual(result.headings.h1, ['Primary heading']);
  assert.equal(result.looksLikeAppShell, false);
  assert.deepEqual(buildHtmlIssues(result, { ok: true, statusCode: 200 }), []);
});

test('flags a thin JavaScript app shell', () => {
  const result = analyzeHtml(`<!doctype html><div id="root"></div>
    <script type="module" src="/assets/app.js"></script><script src="/vendor.js"></script>`);
  const issues = buildHtmlIssues(result, { ok: true, statusCode: 200 });

  assert.equal(result.looksLikeAppShell, true);
  assert.ok(issues.some((issue) => issue.code === 'app_shell' && issue.severity === 'critical'));
  const appShellIssue = issues.find((issue) => issue.code === 'app_shell');
  assert.ok(appShellIssue.why);
  assert.ok(appShellIssue.nextStep);
  assert.ok(appShellIssue.evidence.signals.length);
});

test('removes executable and hidden template content from readable text', () => {
  assert.equal(
    stripTags('<p>Shown</p><script>secret()</script><style>.x{}</style><template>Hidden</template>'),
    'Shown',
  );
});

test('classifies deterministic app-shell fixtures conservatively', async () => {
  const expectations = new Map([
    ['healthy.html', false],
    ['thin-app-shell.html', true],
    ['minimal-static.html', false],
    ['canvas-app.html', false],
    ['hidden-script-content.html', false],
    ['metadata-no-body.html', false],
    ['loading-placeholder.html', true],
    ['cookie-complete.html', false],
    ['crawler-blocked.html', false],
    ['missing-metadata.html', false],
    ['malformed-canonical.html', false],
  ]);

  for (const [name, expected] of expectations) {
    const result = analyzeHtml(await fixture(name));
    assert.equal(result.looksLikeAppShell, expected, name);
  }
});

test('does not count hidden script payloads as visible text', async () => {
  const result = analyzeHtml(await fixture('hidden-script-content.html'));
  assert.ok(result.textLength < 100);
  assert.doesNotMatch(result.textExcerpt, /hidden payload/);
});

test('reports metadata-only and malformed HTML without throwing', async () => {
  const metadataOnly = analyzeHtml(await fixture('metadata-no-body.html'));
  assert.equal(metadataOnly.title, 'Metadata-only page');
  assert.equal(metadataOnly.textLength, 0);
  assert.equal(metadataOnly.looksLikeAppShell, false);

  const malformed = analyzeHtml('<html><head><title>Unclosed<body><h1>Still readable');
  assert.equal(typeof malformed.textLength, 'number');

  const canonical = analyzeHtml(await fixture('malformed-canonical.html'));
  assert.equal(canonical.canonicalUrl, '::not-a-url');
  assert.ok(buildHtmlIssues(canonical, { ok: true, statusCode: 200, contentType: 'text/html' })
    .some((issue) => issue.code === 'invalid_canonical'));
});

test('explains missing metadata, thin HTML, content type, and truncation', () => {
  const summary = analyzeHtml('<main><p>Short</p></main>');
  const issues = buildHtmlIssues(summary, {
    ok: true,
    statusCode: 200,
    contentType: 'application/json',
    truncated: true,
    maxChars: 100,
  });
  for (const code of ['unexpected_content_type', 'response_truncated', 'missing_title', 'missing_description', 'missing_h1', 'thin_html']) {
    const issue = issues.find((candidate) => candidate.code === code);
    assert.ok(issue, code);
    assert.ok(issue.why, code);
    assert.ok(issue.evidence, code);
    assert.ok(issue.nextStep, code);
  }
});
