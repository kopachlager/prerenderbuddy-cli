function decodeEntities(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanText(value = '') {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

export function stripTags(html = '') {
  return cleanText(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function tagContent(html, pattern) {
  return cleanText(html.match(pattern)?.[1] || '');
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cleanText(tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '');
}

function metaContent(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const target = key.toLowerCase();
  const tag = tags.find((candidate) => (
    [attribute(candidate, 'name'), attribute(candidate, 'property')]
      .some((value) => value.toLowerCase() === target)
  ));
  return tag ? attribute(tag, 'content') : '';
}

function linkHref(html, relation) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const target = relation.toLowerCase();
  const tag = tags.find((candidate) => (
    attribute(candidate, 'rel').toLowerCase().split(/\s+/).includes(target)
  ));
  return tag ? attribute(tag, 'href') : '';
}

function headings(html, level) {
  const matches = html.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi'));
  return [...new Set([...matches].map((match) => stripTags(match[1])).filter(Boolean))].slice(0, 12);
}

function frameworkSigns(html) {
  const checks = [
    [/id=["']root["']/i, 'root div'],
    [/id=["']app["']/i, 'app div'],
    [/data-reactroot/i, 'React marker'],
    [/__NEXT_DATA__/i, 'Next.js data'],
    [/\b(vite|@vite)\b/i, 'Vite marker'],
    [/\/assets\/[^"']+\.(?:js|css)/i, 'bundled assets'],
    [/<script\b[^>]*type=["']module["']/i, 'module scripts'],
  ];
  return checks.filter(([pattern]) => pattern.test(html)).map(([, label]) => label);
}

export function analyzeHtml(html = '') {
  const visibleText = stripTags(html);
  const scriptCount = (html.match(/<script\b/gi) || []).length;
  const signs = frameworkSigns(html);
  const textLength = visibleText.length;
  const hasEmptyMountPoint = /<(?:div|main)\b[^>]*\bid=["'](?:root|app)["'][^>]*>\s*<\/(?:div|main)>/i.test(html);
  const hasLoadingPlaceholder = textLength < 180
    && /\b(?:loading|please wait|initializing|starting)\b/i.test(visibleText);
  const hasModuleOrBundledScript = /<script\b[^>]*(?:type=["']module["']|src=["'][^"']*(?:\/assets\/|bundle|app)[^"']*\.js)/i.test(html);
  const appShellEvidence = [
    ...(hasEmptyMountPoint ? ['empty root or app mount point'] : []),
    ...(hasLoadingPlaceholder ? ['loading-only visible text'] : []),
    ...(hasModuleOrBundledScript ? ['module or bundled application script'] : []),
    ...(scriptCount >= 2 ? [`${scriptCount} script elements`] : []),
    ...signs.map((sign) => `${sign} detected`),
  ];
  const looksLikeAppShell = textLength < 300 && (
    (hasEmptyMountPoint && scriptCount >= 1)
    || (hasLoadingPlaceholder && hasModuleOrBundledScript)
    || (textLength < 80 && hasModuleOrBundledScript)
  );

  return {
    title: tagContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: metaContent(html, 'description'),
    canonicalUrl: linkHref(html, 'canonical'),
    robots: metaContent(html, 'robots'),
    headings: {
      h1: headings(html, 1),
      h2: headings(html, 2),
      h3: headings(html, 3),
    },
    textLength,
    wordCount: visibleText ? visibleText.split(/\s+/).length : 0,
    textExcerpt: visibleText.slice(0, 500),
    scriptCount,
    frameworkSigns: signs,
    appShellEvidence,
    looksLikeAppShell,
  };
}

export function buildHtmlIssues(summary, response = {}) {
  const issues = [];
  if (!response.ok) {
    issues.push({
      severity: 'critical',
      code: 'http_error',
      message: `Page returned HTTP ${response.statusCode}.`,
      why: 'An unsuccessful HTTP response can prevent crawlers from accessing the page content.',
      evidence: { statusCode: response.statusCode },
      nextStep: 'Confirm that the public URL returns a successful response for the selected crawler profile.',
    });
  }
  if (response.contentType && !/(?:text\/html|application\/xhtml\+xml)/i.test(response.contentType)) {
    issues.push({
      severity: 'critical',
      code: 'unexpected_content_type',
      message: `Page returned ${response.contentType} instead of HTML.`,
      why: 'HTML diagnostics are not reliable when the response declares a different media type.',
      evidence: { contentType: response.contentType },
      nextStep: 'Check the requested route and its Content-Type header.',
    });
  }
  if (response.truncated) {
    issues.push({
      severity: 'warning',
      code: 'response_truncated',
      message: `Analysis stopped after the configured ${response.maxChars} character response limit.`,
      why: 'Signals after the response limit were not analysed.',
      evidence: { maxChars: response.maxChars },
      nextStep: 'Review the response size and rerun with a focused page when possible.',
    });
  }
  if (!summary.title) {
    issues.push({
      severity: 'warning',
      code: 'missing_title',
      message: 'Returned HTML is missing a page title.',
      why: 'The title is a primary page-identification signal in the returned HTML.',
      evidence: { title: '' },
      nextStep: 'Add a descriptive <title> to the initial HTML response.',
    });
  }
  if (!summary.description) {
    issues.push({
      severity: 'warning',
      code: 'missing_description',
      message: 'Returned HTML is missing a meta description.',
      why: 'A description helps crawlers and preview systems understand the page summary.',
      evidence: { description: '' },
      nextStep: 'Add a page-specific meta description to the initial HTML response.',
    });
  }
  if (!summary.headings.h1.length) {
    issues.push({
      severity: 'warning',
      code: 'missing_h1',
      message: 'Returned HTML is missing an H1 heading.',
      why: 'A primary heading provides a clear content label in the returned document.',
      evidence: { h1Count: 0 },
      nextStep: 'Include the page’s primary heading in the initial HTML response.',
    });
  }
  if (summary.canonicalUrl) {
    let canonicalIsValid = false;
    try {
      canonicalIsValid = ['http:', 'https:'].includes(new URL(summary.canonicalUrl).protocol);
    } catch {
      canonicalIsValid = false;
    }
    if (!canonicalIsValid) {
      issues.push({
        severity: 'warning',
        code: 'invalid_canonical',
        message: 'Returned HTML contains a canonical URL that is not an absolute HTTP(S) URL.',
        why: 'A malformed or relative canonical can make the preferred page URL ambiguous.',
        evidence: { canonicalUrl: summary.canonicalUrl },
        nextStep: 'Replace the canonical value with the intended absolute public HTTP(S) URL.',
      });
    }
  }
  if (summary.looksLikeAppShell) {
    issues.push({
      severity: 'critical',
      code: 'app_shell',
      message: 'Returned HTML has limited visible content and multiple JavaScript app-shell signals.',
      why: 'Crawlers that do not execute JavaScript may receive only the application shell.',
      evidence: {
        readableCharacters: summary.textLength,
        scriptCount: summary.scriptCount,
        signals: summary.appShellEvidence,
      },
      nextStep: 'Inspect the raw response and test whether important page content is present before JavaScript executes.',
    });
  } else if (summary.textLength < 300) {
    issues.push({
      severity: 'warning',
      code: 'thin_html',
      message: 'Returned HTML contains less than 300 readable characters.',
      why: 'A short response may be legitimate, but it may also omit important page content.',
      evidence: { readableCharacters: summary.textLength, threshold: 300 },
      nextStep: 'Review whether the returned text contains the page’s primary information.',
    });
  }
  return issues;
}
