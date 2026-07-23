import { fetchPublicText } from './fetch-public.js';
import { getUserAgentProfile } from './profiles.js';
import { normalizePublicUrl } from './url-safety.js';

function fileUrl(siteUrl, pathname) {
  return new URL(pathname, normalizePublicUrl(siteUrl)).toString();
}

export function parseRobots(text) {
  const sitemapLines = text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i)?.[1])
    .filter(Boolean);
  const invalidSitemaps = sitemapLines.filter((value) => {
    try {
      return !['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return true;
    }
  });
  return { sitemapLines, invalidSitemaps };
}

export function parseSitemap(text, expectedHostname) {
  const locations = [...text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => match[1].trim());
  const invalidUrls = [];
  const otherHosts = [];

  for (const value of locations) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) invalidUrls.push(value);
      if (url.hostname !== expectedHostname) otherHosts.push(value);
    } catch {
      invalidUrls.push(value);
    }
  }
  return { locationCount: locations.length, invalidUrls, otherHosts };
}

function resultForFile(name, response, details, issues) {
  return {
    name,
    url: response.requestedUrl,
    statusCode: response.statusCode,
    finalUrl: response.finalUrl,
    contentType: response.contentType,
    details,
    issues,
    summary: issues.some((issue) => issue.severity === 'critical')
      ? 'critical'
      : issues.length
        ? 'warning'
        : 'pass',
  };
}

export async function checkDiscoveryFiles(input, options = {}) {
  const url = normalizePublicUrl(input);
  const origin = new URL(url).origin;
  const hostname = new URL(url).hostname;
  const profile = getUserAgentProfile(options.userAgent);
  const paths = [
    ['robots.txt', '/robots.txt', 'text/plain,*/*;q=0.5'],
    ['sitemap.xml', '/sitemap.xml', 'application/xml,text/xml,*/*;q=0.5'],
    ['llms.txt', '/llms.txt', 'text/plain,text/markdown,*/*;q=0.5'],
  ];

  const responses = await Promise.all(paths.map(async ([name, pathname, accept]) => {
    const response = await fetchPublicText(fileUrl(origin, pathname), {
      userAgent: profile.value,
      accept,
      timeoutMs: options.timeoutMs,
      maxChars: 1_000_000,
      fetchFn: options.fetchFn,
      assertUrlFn: options.assertUrlFn,
    });
    return [name, response];
  }));

  const files = responses.map(([name, response]) => {
    const issues = [];
    if (!response.ok) {
      issues.push({
        severity: name === 'llms.txt' ? 'warning' : 'critical',
        code: 'http_error',
        message: `${name} returned HTTP ${response.statusCode}.`,
        why: `${name} could not be read successfully at its conventional public URL.`,
        evidence: { statusCode: response.statusCode, finalUrl: response.finalUrl },
        nextStep: `Confirm whether ${name} should exist and that its public URL returns the intended file.`,
      });
    }

    if (name === 'robots.txt') {
      const details = parseRobots(response.text);
      if (response.ok && response.contentType && !/(?:text\/plain|text\/robots|application\/octet-stream)/i.test(response.contentType)) {
        issues.push({
          severity: 'warning',
          code: 'unexpected_content_type',
          message: `robots.txt returned ${response.contentType}.`,
          why: 'An HTML fallback or unexpected media type can hide a missing robots.txt file.',
          evidence: { contentType: response.contentType },
          nextStep: 'Return robots.txt as plain text and verify that the route is not serving an HTML fallback.',
        });
      }
      if (details.invalidSitemaps.length) {
        issues.push({
          severity: 'warning',
          code: 'invalid_sitemap_directive',
          message: 'One or more Sitemap directives are not valid absolute HTTP(S) URLs.',
          why: 'Crawler sitemap directives should resolve without relying on a document base URL.',
          evidence: { invalidValues: details.invalidSitemaps },
          nextStep: 'Replace relative or malformed Sitemap values with absolute HTTP(S) URLs.',
        });
      }
      return resultForFile(name, response, details, issues);
    }

    if (name === 'sitemap.xml') {
      const details = parseSitemap(response.text, hostname);
      if (response.ok && response.contentType && !/(?:application|text)\/(?:[a-z0-9.+-]*\+)?xml/i.test(response.contentType)) {
        issues.push({
          severity: 'warning',
          code: 'unexpected_content_type',
          message: `sitemap.xml returned ${response.contentType}.`,
          why: 'An HTML fallback or unexpected media type can hide a missing XML sitemap.',
          evidence: { contentType: response.contentType },
          nextStep: 'Return sitemap.xml with an XML content type and verify that the route is not serving an HTML fallback.',
        });
      }
      if (response.ok && details.locationCount === 0) {
        issues.push({
          severity: 'warning',
          code: 'no_sitemap_urls',
          message: 'No <loc> URLs were found in sitemap.xml.',
          why: 'A sitemap without URL locations does not provide discoverable page entries.',
          evidence: { locationCount: 0 },
          nextStep: 'Add absolute page URLs or confirm that this is an intentionally empty sitemap index.',
        });
      }
      if (details.invalidUrls.length) {
        issues.push({
          severity: 'warning',
          code: 'invalid_sitemap_urls',
          message: 'One or more sitemap entries are not valid absolute HTTP(S) URLs.',
          why: 'Relative or malformed sitemap locations may not be interpreted consistently.',
          evidence: { invalidValues: details.invalidUrls },
          nextStep: 'Replace invalid <loc> values with absolute HTTP(S) URLs.',
        });
      }
      if (details.otherHosts.length) {
        issues.push({
          severity: 'warning',
          code: 'different_sitemap_host',
          message: 'One or more sitemap entries use a different hostname.',
          why: 'Cross-host entries may be intentional, but often indicate a staging or canonical-host mismatch.',
          evidence: { expectedHostname: hostname, otherHostUrls: details.otherHosts },
          nextStep: 'Confirm that every hostname is intentional and publicly canonical.',
        });
      }
      return resultForFile(name, response, details, issues);
    }

    const details = {
      characterCount: response.text.trim().length,
      hasHeading: /^\s*#\s+\S/m.test(response.text),
      hasLinks: /https?:\/\/\S+/i.test(response.text),
    };
    if (response.ok && response.contentType && !/(?:text\/plain|text\/markdown)/i.test(response.contentType)) {
      issues.push({
        severity: 'warning',
        code: 'unexpected_content_type',
        message: `llms.txt returned ${response.contentType}.`,
        why: 'An HTML fallback or unexpected media type can hide a missing llms.txt file.',
        evidence: { contentType: response.contentType },
        nextStep: 'Return llms.txt as plain text or Markdown and verify that the route is not serving an HTML fallback.',
      });
    }
    if (response.ok && !response.text.trim()) {
      issues.push({
        severity: 'warning',
        code: 'empty_llms',
        message: 'llms.txt is empty.',
        why: 'An empty file provides no project summary or resource references.',
        evidence: { characterCount: 0 },
        nextStep: 'Add useful plain-text or Markdown content, or remove the empty file if it is not used.',
      });
    } else if (response.ok && !details.hasHeading) {
      issues.push({
        severity: 'warning',
        code: 'llms_missing_heading',
        message: 'llms.txt does not contain a Markdown H1 heading.',
        why: 'A primary heading is a basic structural signal for the proposed llms.txt format.',
        evidence: { hasHeading: false, characterCount: details.characterCount },
        nextStep: 'Add one clear Markdown H1 heading near the beginning of the file.',
      });
    }
    return resultForFile(name, response, details, issues);
  });

  const issues = files.flatMap((file) => file.issues.map((issue) => ({ ...issue, file: file.name })));
  return {
    command: 'files',
    checkedAt: new Date().toISOString(),
    url,
    origin,
    profile: { name: profile.name, label: profile.label },
    files,
    issues,
    summary: issues.some((issue) => issue.severity === 'critical')
      ? 'critical'
      : issues.length
        ? 'warning'
        : 'pass',
    note: 'Discovery files can guide crawlers, but they do not make client-rendered page content readable.',
  };
}
