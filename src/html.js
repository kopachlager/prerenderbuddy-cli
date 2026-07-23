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
    looksLikeAppShell: textLength < 300 && (scriptCount >= 2 || signs.length > 0),
  };
}

export function buildHtmlIssues(summary, response = {}) {
  const issues = [];
  if (!response.ok) {
    issues.push({ severity: 'critical', code: 'http_error', message: `Page returned HTTP ${response.statusCode}.` });
  }
  if (!summary.title) {
    issues.push({ severity: 'warning', code: 'missing_title', message: 'Raw HTML is missing a page title.' });
  }
  if (!summary.description) {
    issues.push({ severity: 'warning', code: 'missing_description', message: 'Raw HTML is missing a meta description.' });
  }
  if (!summary.headings.h1.length) {
    issues.push({ severity: 'warning', code: 'missing_h1', message: 'Raw HTML is missing an H1 heading.' });
  }
  if (summary.looksLikeAppShell) {
    issues.push({
      severity: 'critical',
      code: 'app_shell',
      message: 'Raw HTML has limited visible content and JavaScript app-shell signs.',
    });
  } else if (summary.textLength < 300) {
    issues.push({
      severity: 'warning',
      code: 'thin_html',
      message: 'Raw HTML contains less than 300 readable characters.',
    });
  }
  return issues;
}
