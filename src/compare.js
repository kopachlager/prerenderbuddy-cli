import { fetchPublicText } from './fetch-public.js';
import { analyzeHtml } from './html.js';
import { getUserAgentProfile } from './profiles.js';
import { normalizePublicUrl } from './url-safety.js';

function contentDelta(browser, crawler) {
  const baseline = Math.max(browser.textLength, 1);
  return {
    textLength: crawler.textLength - browser.textLength,
    textRatio: Number((crawler.textLength / baseline).toFixed(2)),
    titleChanged: crawler.title !== browser.title,
    descriptionChanged: crawler.description !== browser.description,
    h1Changed: JSON.stringify(crawler.headings.h1) !== JSON.stringify(browser.headings.h1),
  };
}

export async function compareUrl(input, options = {}) {
  const url = normalizePublicUrl(input);
  const browserProfile = getUserAgentProfile('browser');
  const crawlerProfile = getUserAgentProfile(options.userAgent);

  const [browserResponse, crawlerResponse] = await Promise.all([
    fetchPublicText(url, { userAgent: browserProfile.value, timeoutMs: options.timeoutMs }),
    fetchPublicText(url, { userAgent: crawlerProfile.value, timeoutMs: options.timeoutMs }),
  ]);
  const browser = analyzeHtml(browserResponse.text);
  const crawler = analyzeHtml(crawlerResponse.text);
  const difference = contentDelta(browser, crawler);
  const materiallyDifferent = browserResponse.statusCode !== crawlerResponse.statusCode
    || difference.textRatio < 0.7
    || difference.textRatio > 1.3
    || difference.titleChanged
    || difference.h1Changed;

  const issues = [];
  if (browserResponse.statusCode !== crawlerResponse.statusCode) {
    issues.push({
      severity: 'critical',
      code: 'status_differs',
      message: `Browser and ${crawlerProfile.label} responses return different status codes.`,
    });
  }
  if (materiallyDifferent) {
    issues.push({
      severity: 'warning',
      code: 'crawler_response_differs',
      message: `The ${crawlerProfile.label} response differs materially from the browser-style response; review whether the difference is intended.`,
    });
  }
  if (crawler.looksLikeAppShell) {
    issues.push({
      severity: 'critical',
      code: 'crawler_app_shell',
      message: `The ${crawlerProfile.label} response appears to contain a thin JavaScript app shell.`,
    });
  }

  return {
    command: 'compare',
    checkedAt: new Date().toISOString(),
    url,
    crawlerProfile: { name: crawlerProfile.name, label: crawlerProfile.label },
    browser: {
      response: {
        statusCode: browserResponse.statusCode,
        finalUrl: browserResponse.finalUrl,
        contentType: browserResponse.contentType,
      },
      html: browser,
    },
    crawler: {
      response: {
        statusCode: crawlerResponse.statusCode,
        finalUrl: crawlerResponse.finalUrl,
        contentType: crawlerResponse.contentType,
      },
      html: crawler,
    },
    difference,
    issues,
    summary: issues.some((issue) => issue.severity === 'critical')
      ? 'critical'
      : issues.length
        ? 'warning'
        : 'pass',
    note: 'Different output is evidence to review, not proof of cloaking or a ranking problem.',
  };
}
