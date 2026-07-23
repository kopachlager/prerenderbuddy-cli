import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeHtml, buildHtmlIssues, stripTags } from '../src/html.js';

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
});

test('removes executable and hidden template content from readable text', () => {
  assert.equal(
    stripTags('<p>Shown</p><script>secret()</script><style>.x{}</style><template>Hidden</template>'),
    'Shown',
  );
});
