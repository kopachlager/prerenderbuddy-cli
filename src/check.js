import { fetchPublicText } from './fetch-public.js';
import { analyzeHtml, buildHtmlIssues } from './html.js';
import { getUserAgentProfile } from './profiles.js';
import { normalizePublicUrl } from './url-safety.js';

export async function checkUrl(input, options = {}) {
  const url = normalizePublicUrl(input);
  const profile = getUserAgentProfile(options.userAgent);
  const response = await fetchPublicText(url, {
    userAgent: profile.value,
    timeoutMs: options.timeoutMs,
  });
  const html = analyzeHtml(response.text);
  const issues = buildHtmlIssues(html, response);

  return {
    command: 'check',
    checkedAt: new Date().toISOString(),
    url,
    profile: { name: profile.name, label: profile.label },
    response: {
      statusCode: response.statusCode,
      ok: response.ok,
      finalUrl: response.finalUrl,
      contentType: response.contentType,
    },
    html,
    issues,
    summary: issues.some((issue) => issue.severity === 'critical')
      ? 'critical'
      : issues.length
        ? 'warning'
        : 'pass',
    note: 'This checks returned HTML only. It does not predict rankings, indexing, citations, mentions, or traffic.',
  };
}
