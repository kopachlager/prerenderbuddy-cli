import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkUrl } from '../src/check.js';
import { formatHuman } from '../src/format.js';

async function fixture(name) {
  return readFile(new URL(`./fixtures/html/${name}`, import.meta.url), 'utf8');
}

test('checks returned HTML with the selected crawler profile', async () => {
  const result = await checkUrl('https://example.com/page', {
    userAgent: 'gptbot',
    assertUrlFn: async () => {},
    fetchFn: async () => new Response(await fixture('healthy.html'), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  });

  assert.equal(result.command, 'check');
  assert.equal(result.profile.name, 'gptbot');
  assert.equal(result.summary, 'pass');
  assert.equal(result.response.truncated, false);
});

test('separates HTTP and content-type failures from heuristic findings', async () => {
  const result = await checkUrl('https://example.com/data', {
    assertUrlFn: async () => {},
    fetchFn: async () => new Response('{"message":"blocked"}', {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
  });

  assert.equal(result.summary, 'critical');
  assert.ok(result.issues.some((issue) => issue.code === 'http_error'));
  assert.ok(result.issues.some((issue) => issue.code === 'unexpected_content_type'));
});

test('README demonstration matches actual formatter output', async () => {
  const html = await fixture('loading-placeholder.html');
  const result = await checkUrl('https://example.com/app', {
    userAgent: 'googlebot',
    assertUrlFn: async () => {},
    fetchFn: async () => new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  });
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(formatHuman(result)));
});
