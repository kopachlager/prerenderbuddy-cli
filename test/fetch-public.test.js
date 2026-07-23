import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPublicText, readBoundedText } from '../src/fetch-public.js';

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
  assert.equal(result.truncated, true);
  assert.equal(result.maxChars, 5);
});

test('blocks a redirect target when public URL validation rejects it', async () => {
  const responses = [
    new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
  ];
  await assert.rejects(
    () => fetchPublicText('https://example.com/start', {
      assertUrlFn: async (url) => {
        if (url.includes('127.0.0.1')) throw new Error('The URL resolves to a private or blocked network address.');
      },
      fetchFn: async () => responses.shift(),
    }),
    /private or blocked/,
  );
});

test('reports timeouts separately from response diagnostics', async () => {
  await assert.rejects(
    () => fetchPublicText('https://example.com/slow', {
      timeoutMs: 1,
      assertUrlFn: async () => {},
      fetchFn: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    }),
    /timed out after 1 ms/,
  );
});

test('preserves response content type and non-truncated state', async () => {
  const result = await fetchPublicText('https://example.com/data', {
    assertUrlFn: async () => {},
    fetchFn: async () => new Response('hello', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
  });
  assert.equal(result.contentType, 'text/plain; charset=utf-8');
  assert.equal(result.truncated, false);
});

test('handles responses without a stream and redirects without a location', async () => {
  const noBodyResponse = {
    body: null,
    text: async () => 'abcdef',
  };
  assert.equal(await readBoundedText(noBodyResponse, 3), 'abc');

  const result = await fetchPublicText('https://example.com/redirect', {
    assertUrlFn: async () => {},
    fetchFn: async () => new Response('', { status: 302 }),
  });
  assert.equal(result.statusCode, 302);
  assert.equal(result.text, '');
  assert.equal(result.truncated, false);
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
