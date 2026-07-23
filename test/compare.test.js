import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compareUrl, contentDelta } from '../src/compare.js';
import { formatHuman } from '../src/format.js';
import { analyzeHtml } from '../src/html.js';

async function fixture(name) {
  return readFile(new URL(`./fixtures/html/${name}`, import.meta.url), 'utf8');
}

function responseQueue(...responses) {
  return async () => responses.shift();
}

test('compares two HTTP user-agent responses without claiming browser rendering', async () => {
  const html = await fixture('healthy.html');
  const result = await compareUrl('https://example.com', {
    userAgent: 'gptbot',
    assertUrlFn: async () => {},
    fetchFn: responseQueue(
      new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    ),
  });

  assert.equal(result.comparisonMode, 'http-user-agent-responses');
  assert.equal(result.summary, 'pass');
  assert.match(result.note, /Neither executes JavaScript/);
});

test('reports exact metadata and text-volume differences separately', async () => {
  const standard = await fixture('healthy.html');
  const crawler = '<html><head><title>Different</title><meta name="description" content="Other"></head><body><h1>Other H1</h1><p>Short</p></body></html>';
  const result = await compareUrl('https://example.com', {
    userAgent: 'googlebot',
    textRatioThreshold: 0.2,
    assertUrlFn: async () => {},
    fetchFn: responseQueue(
      new Response(standard, { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response(crawler, { status: 200, headers: { 'content-type': 'text/html' } }),
    ),
  });

  assert.equal(result.materiallyDifferent, true);
  assert.deepEqual(result.difference.acceptedTextRatio, { minimum: 0.8, maximum: 1.2 });
  for (const code of ['text_volume_differs', 'title_differs', 'description_differs', 'h1_differs']) {
    const issue = result.issues.find((candidate) => candidate.code === code);
    assert.ok(issue, code);
    assert.ok(issue.evidence, code);
  }
  assert.ok(result.issues.some((issue) => (
    issue.code === 'crawler_response_differs' && issue.compatibilityAlias
  )));
  assert.match(JSON.stringify(result), /crawler_response_differs/);
  const human = formatHuman(result);
  assert.match(human, /text_volume_differs/);
  assert.doesNotMatch(human, /crawler_response_differs/);
});

test('status differences and crawler app shells remain critical', async () => {
  const result = await compareUrl('https://example.com', {
    assertUrlFn: async () => {},
    fetchFn: responseQueue(
      new Response(await fixture('healthy.html'), { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response(await fixture('thin-app-shell.html'), { status: 503, headers: { 'content-type': 'text/html' } }),
    ),
  });

  assert.equal(result.summary, 'critical');
  assert.ok(result.issues.some((issue) => issue.code === 'status_differs'));
  assert.ok(result.issues.some((issue) => issue.code === 'crawler_app_shell'));
});

test('content delta exposes configured ratio values without semantic comparison', () => {
  const standard = analyzeHtml('<h1>Standard</h1><p>One two three four</p>');
  const crawler = analyzeHtml('<h1>Crawler</h1><p>One two</p>');
  const difference = contentDelta(standard, crawler, 0.25);

  assert.equal(difference.textRatioThreshold, 0.25);
  assert.deepEqual(difference.acceptedTextRatio, { minimum: 0.75, maximum: 1.25 });
  assert.equal(difference.h1Changed, true);
});
