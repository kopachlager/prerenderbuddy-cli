import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkDiscoveryFiles, parseRobots, parseSitemap } from '../src/discovery.js';

async function fixture(name) {
  return readFile(new URL(`./fixtures/discovery/${name}`, import.meta.url), 'utf8');
}

test('parses malformed robots and sitemap values deterministically', async () => {
  const robots = parseRobots(await fixture('robots-malformed.txt'));
  assert.deepEqual(robots.invalidSitemaps, ['/sitemap.xml']);

  const relative = parseSitemap(await fixture('sitemap-relative.xml'), 'example.com');
  assert.deepEqual(relative.invalidUrls, ['/relative-page']);

  const mismatch = parseSitemap(await fixture('sitemap-hostname-mismatch.xml'), 'example.com');
  assert.equal(mismatch.otherHosts.length, 1);
});

test('checks robots, sitemap, and llms files with explainable findings', async () => {
  const bodies = {
    '/robots.txt': [await fixture('robots-malformed.txt'), 'text/plain'],
    '/sitemap.xml': [await fixture('sitemap-hostname-mismatch.xml'), 'application/xml'],
    '/llms.txt': [await fixture('llms-malformed.txt'), 'text/plain'],
  };
  const result = await checkDiscoveryFiles('https://example.com/path', {
    assertUrlFn: async () => {},
    fetchFn: async (url) => {
      const [body, contentType] = bodies[new URL(url).pathname];
      return new Response(body, { status: 200, headers: { 'content-type': contentType } });
    },
  });

  assert.equal(result.command, 'files');
  assert.equal(result.summary, 'warning');
  for (const code of ['invalid_sitemap_directive', 'different_sitemap_host', 'llms_missing_heading']) {
    const issue = result.issues.find((candidate) => candidate.code === code);
    assert.ok(issue, code);
    assert.ok(issue.why, code);
    assert.ok(issue.evidence, code);
    assert.ok(issue.nextStep, code);
  }
});

test('passes valid deterministic discovery files', async () => {
  const bodies = {
    '/robots.txt': ['User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n', 'text/plain'],
    '/sitemap.xml': ['<urlset><url><loc>https://example.com/page</loc></url></urlset>', 'application/xml'],
    '/llms.txt': [await fixture('llms-basic.txt'), 'text/markdown'],
  };
  const result = await checkDiscoveryFiles('https://example.com', {
    assertUrlFn: async () => {},
    fetchFn: async (url) => {
      const [body, contentType] = bodies[new URL(url).pathname];
      return new Response(body, { status: 200, headers: { 'content-type': contentType } });
    },
  });

  assert.equal(result.summary, 'pass');
  assert.equal(result.issues.length, 0);
});

test('distinguishes missing files, HTML fallbacks, empty sitemaps, and empty llms files', async () => {
  const missing = await checkDiscoveryFiles('https://example.com', {
    assertUrlFn: async () => {},
    fetchFn: async () => new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    }),
  });
  assert.equal(missing.summary, 'critical');
  assert.equal(missing.issues.filter((issue) => issue.code === 'http_error').length, 3);
  assert.equal(
    missing.files.find((file) => file.name === 'llms.txt').issues[0].severity,
    'warning',
  );

  const bodies = {
    '/robots.txt': ['<html>Fallback</html>', 'text/html'],
    '/sitemap.xml': ['<urlset></urlset>', 'text/html'],
    '/llms.txt': ['', 'text/html'],
  };
  const malformed = await checkDiscoveryFiles('https://example.com', {
    assertUrlFn: async () => {},
    fetchFn: async (url) => {
      const [body, contentType] = bodies[new URL(url).pathname];
      return new Response(body, { status: 200, headers: { 'content-type': contentType } });
    },
  });
  for (const code of ['unexpected_content_type', 'no_sitemap_urls', 'empty_llms']) {
    assert.ok(malformed.issues.some((issue) => issue.code === code), code);
  }
});
