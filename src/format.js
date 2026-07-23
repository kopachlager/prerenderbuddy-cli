function line(label, value) {
  return `${label.padEnd(18)} ${value ?? '—'}`;
}

function evidence(value) {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function formatIssue(issue) {
  return [
    `- ${issue.severity.toUpperCase()} [${issue.code}]: ${issue.message}`,
    issue.why ? `  Why: ${issue.why}` : null,
    issue.evidence !== undefined ? `  Evidence: ${evidence(issue.evidence)}` : null,
    issue.nextStep ? `  Next: ${issue.nextStep}` : null,
  ].filter(Boolean).join('\n');
}

function formatIssues(issues) {
  if (!issues.length) return '\nNo material issues detected by this check.';
  const visibleIssues = issues.filter((issue) => !issue.compatibilityAlias);
  return `\nIssues:\n${visibleIssues.map(formatIssue).join('\n')}`;
}

export function formatHuman(result) {
  if (result.command === 'check') {
    return [
      `Prerender Buddy · crawler HTML check · ${result.summary.toUpperCase()}`,
      line('URL', result.url),
      line('Crawler profile', result.profile.label),
      line('HTTP', result.response.statusCode),
      line('Final URL', result.response.finalUrl),
      line('Title', result.html.title || '(missing)'),
      line('Description', result.html.description || '(missing)'),
      line('H1', result.html.headings.h1.join(' | ') || '(missing)'),
      line('Readable text', `${result.html.textLength} characters / ${result.html.wordCount} words`),
      line('App-shell signs', result.html.frameworkSigns.join(', ') || 'none detected'),
      formatIssues(result.issues),
      `\n${result.note}`,
    ].join('\n');
  }

  if (result.command === 'compare') {
    return [
      `Prerender Buddy · response comparison · ${result.summary.toUpperCase()}`,
      line('URL', result.url),
      line('Crawler profile', result.crawlerProfile.label),
      line('Standard HTTP', result.browser.response.statusCode),
      line('Crawler HTTP', result.crawler.response.statusCode),
      line('Standard text', `${result.browser.html.textLength} characters`),
      line('Crawler text', `${result.crawler.html.textLength} characters`),
      line('Text ratio', result.difference.textRatio),
      line(
        'Accepted ratio',
        `${result.difference.acceptedTextRatio.minimum}–${result.difference.acceptedTextRatio.maximum}`,
      ),
      line('Title changed', result.difference.titleChanged ? 'yes' : 'no'),
      line('Description changed', result.difference.descriptionChanged ? 'yes' : 'no'),
      line('H1 changed', result.difference.h1Changed ? 'yes' : 'no'),
      formatIssues(result.issues),
      `\n${result.note}`,
    ].join('\n');
  }

  const fileLines = result.files.flatMap((file) => [
    `\n${file.name} · ${file.summary.toUpperCase()}`,
    line('URL', file.url),
    line('HTTP', file.statusCode),
    ...file.issues.map(formatIssue),
  ]);
  return [
    `Prerender Buddy · discovery-file check · ${result.summary.toUpperCase()}`,
    line('Origin', result.origin),
    ...fileLines,
    `\n${result.note}`,
  ].join('\n');
}
