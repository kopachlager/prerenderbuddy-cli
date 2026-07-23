import { fetchPublicText } from './fetch-public.js';
import { getUserAgentProfile } from './profiles.js';
import { normalizePublicUrl } from './url-safety.js';

function fileUrl(siteUrl, pathname) {
  return new URL(pathname, normalizePublicUrl(siteUrl)).toString();
}

function parseRobots(text) {
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

function parseSitemap(text, expectedHostname) {
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
      });
    }

    if (name === 'robots.txt') {
      const details = parseRobots(response.text);
      if (details.invalidSitemaps.length) {
        issues.push({
          severity: 'warning',
          code: 'invalid_sitemap_directive',
          message: 'One or more Sitemap directives are not valid absolute HTTP(S) URLs.',
        });
      }
      return resultForFile(name, response, details, issues);
    }

    if (name === 'sitemap.xml') {
      const details = parseSitemap(response.text, hostname);
      if (response.ok && details.locationCount === 0) {
        issues.push({
          severity: 'warning',
          code: 'no_sitemap_urls',
          message: 'No <loc> URLs were found in sitemap.xml.',
        });
      }
      if (details.invalidUrls.length) {
        issues.push({
          severity: 'warning',
          code: 'invalid_sitemap_urls',
          message: 'One or more sitemap entries are not valid absolute HTTP(S) URLs.',
        });
      }
      if (details.otherHosts.length) {
        issues.push({
          severity: 'warning',
          code: 'different_sitemap_host',
          message: 'One or more sitemap entries use a different hostname.',
        });
      }
      return resultForFile(name, response, details, issues);
    }

    const details = {
      characterCount: response.text.trim().length,
      hasHeading: /^\s*#\s+\S/m.test(response.text),
      hasLinks: /https?:\/\/\S+/i.test(response.text),
    };
    if (response.ok && !response.text.trim()) {
      issues.push({ severity: 'warning', code: 'empty_llms', message: 'llms.txt is empty.' });
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
