import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPublicText } from '../src/fetch-public.js';

test('revalidates redirect targets and returns bounded text', async () => {
  const validated = [];
  const responses = [
    new Response('', { status: 302, headers: { location: '/next' } }),
    new Response('1234567890', { status: 200, headers: { 'content-type': 'text/plain' } }),
  ];

  const result = await fetchPublicText('https://example.com/start', {
    maxChars: 5,
    assertUrlFn: async (url) => validated.push(url),
    fetchFn: async () => responses.shift(),
  });

  assert.deepEqual(validated, [
    'https://example.com/start',
    'https://example.com/next',
  ]);
  assert.equal(result.finalUrl, 'https://example.com/next');
  assert.equal(result.text, '12345');
});

test('stops excessive redirects', async () => {
  await assert.rejects(
    () => fetchPublicText('https://example.com/start', {
      maxRedirects: 1,
      assertUrlFn: async () => {},
      fetchFn: async () => new Response('', { status: 302, headers: { location: '/again' } }),
    }),
    /Too many redirects/,
  );
});
