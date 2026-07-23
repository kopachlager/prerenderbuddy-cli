import { fetchPublicText } from './fetch-public.js';
import { analyzeHtml } from './html.js';
import { getUserAgentProfile } from './profiles.js';
import { normalizePublicUrl } from './url-safety.js';

export function contentDelta(standard, crawler, textRatioThreshold = 0.3) {
  const baseline = Math.max(standard.textLength, 1);
  const minimum = Number((1 - textRatioThreshold).toFixed(2));
  const maximum = Number((1 + textRatioThreshold).toFixed(2));
  return {
    textLength: crawler.textLength - standard.textLength,
    textRatio: Number((crawler.textLength / baseline).toFixed(2)),
    textRatioThreshold,
    acceptedTextRatio: { minimum, maximum },
    titleChanged: crawler.title !== standard.title,
    descriptionChanged: crawler.description !== standard.description,
    h1Changed: JSON.stringify(crawler.headings.h1) !== JSON.stringify(standard.headings.h1),
    values: {
      standard: {
        textLength: standard.textLength,
        title: standard.title,
        description: standard.description,
        h1: standard.headings.h1,
      },
      crawler: {
        textLength: crawler.textLength,
        title: crawler.title,
        description: crawler.description,
        h1: crawler.headings.h1,
      },
    },
  };
}

export async function compareUrl(input, options = {}) {
  const url = normalizePublicUrl(input);
  const browserProfile = getUserAgentProfile('browser');
  const crawlerProfile = getUserAgentProfile(options.userAgent);
  const textRatioThreshold = options.textRatioThreshold ?? 0.3;
  const fetchOptions = {
    timeoutMs: options.timeoutMs,
    fetchFn: options.fetchFn,
    assertUrlFn: options.assertUrlFn,
    maxChars: options.maxChars,
  };

  const [browserResponse, crawlerResponse] = await Promise.all([
    fetchPublicText(url, { ...fetchOptions, userAgent: browserProfile.value }),
    fetchPublicText(url, { ...fetchOptions, userAgent: crawlerProfile.value }),
  ]);
  const browser = analyzeHtml(browserResponse.text);
  const crawler = analyzeHtml(crawlerResponse.text);
  const difference = contentDelta(browser, crawler, textRatioThreshold);
  const textVolumeDiffers = difference.textRatio < difference.acceptedTextRatio.minimum
    || difference.textRatio > difference.acceptedTextRatio.maximum;
  const materiallyDifferent = browserResponse.statusCode !== crawlerResponse.statusCode
    || textVolumeDiffers
    || difference.titleChanged
    || difference.descriptionChanged
    || difference.h1Changed;

  const issues = [];
  if (browserResponse.statusCode !== crawlerResponse.statusCode) {
    issues.push({
      severity: 'critical',
      code: 'status_differs',
      message: `Standard and ${crawlerProfile.label} HTTP responses return different status codes.`,
      why: 'Different status codes can change whether the page is accessible to the selected crawler.',
      evidence: {
        standardStatusCode: browserResponse.statusCode,
        crawlerStatusCode: crawlerResponse.statusCode,
      },
      nextStep: 'Confirm whether crawler-specific status handling is intentional and stable.',
    });
  }
  if (textVolumeDiffers) {
    issues.push({
      severity: 'warning',
      code: 'text_volume_differs',
      message: `The ${crawlerProfile.label} response has a materially different readable-text volume.`,
      why: 'A large text-volume difference can indicate missing content, an interstitial, personalization, or intentional crawler handling.',
      evidence: {
        standardCharacters: browser.textLength,
        crawlerCharacters: crawler.textLength,
        textRatio: difference.textRatio,
        acceptedTextRatio: difference.acceptedTextRatio,
      },
      nextStep: 'Compare the returned text and rule out banners, regional content, experiments, authentication, or temporary edge responses.',
    });
  }
  for (const [changed, code, label, standardValue, crawlerValue] of [
    [difference.titleChanged, 'title_differs', 'title', browser.title, crawler.title],
    [difference.descriptionChanged, 'description_differs', 'meta description', browser.description, crawler.description],
    [difference.h1Changed, 'h1_differs', 'H1 headings', browser.headings.h1, crawler.headings.h1],
  ]) {
    if (!changed) continue;
    issues.push({
      severity: 'warning',
      code,
      message: `The ${crawlerProfile.label} ${label} differs from the standard HTTP response.`,
      why: `Different ${label} values may be intentional, personalized, or caused by crawler-specific response handling.`,
      evidence: { standard: standardValue, crawler: crawlerValue },
      nextStep: `Review both ${label} values and confirm that the difference is expected.`,
    });
  }
  if (crawler.looksLikeAppShell) {
    issues.push({
      severity: 'critical',
      code: 'crawler_app_shell',
      message: `The ${crawlerProfile.label} response has limited visible content and multiple JavaScript app-shell signals.`,
      why: 'The selected crawler may receive an application shell without the page’s primary content.',
      evidence: {
        readableCharacters: crawler.textLength,
        scriptCount: crawler.scriptCount,
        signals: crawler.appShellEvidence,
      },
      nextStep: 'Inspect the crawler HTTP response and verify whether primary content is present without JavaScript execution.',
    });
  }
  if (materiallyDifferent) {
    issues.push({
      severity: 'warning',
      code: 'crawler_response_differs',
      message: `The ${crawlerProfile.label} response differs materially from the standard HTTP response.`,
      why: 'This compatibility finding preserves the original pre-1.0 comparison code while specific findings explain each observed difference.',
      evidence: {
        statusChanged: browserResponse.statusCode !== crawlerResponse.statusCode,
        textVolumeChanged: textVolumeDiffers,
        titleChanged: difference.titleChanged,
        descriptionChanged: difference.descriptionChanged,
        h1Changed: difference.h1Changed,
      },
      nextStep: 'Review the specific comparison findings and confirm whether each difference is expected.',
      compatibilityAlias: true,
    });
  }

  return {
    command: 'compare',
    checkedAt: new Date().toISOString(),
    url,
    crawlerProfile: { name: crawlerProfile.name, label: crawlerProfile.label },
    comparisonMode: 'http-user-agent-responses',
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
    materiallyDifferent,
    issues,
    summary: issues.some((issue) => issue.severity === 'critical')
      ? 'critical'
      : issues.length
        ? 'warning'
        : 'pass',
    note: 'Both sides are HTTP responses. Neither executes JavaScript. Differences are evidence to review, not proof of cloaking or a ranking problem.',
  };
}
