import { readFile } from 'node:fs/promises';
import { checkUrl } from '../src/check.js';
import { formatHuman } from '../src/format.js';

const html = await readFile(
  new URL('../test/fixtures/html/loading-placeholder.html', import.meta.url),
  'utf8',
);
const result = await checkUrl('https://example.com/app', {
  userAgent: 'googlebot',
  assertUrlFn: async () => {},
  fetchFn: async () => new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }),
});

process.stdout.write(`${formatHuman(result)}\n`);
