import assert from 'node:assert/strict';
import test from 'node:test';
import { formatHuman } from '../src/format.js';

const issue = {
  severity: 'warning',
  code: 'example_warning',
  message: 'A diagnostic warning.',
  why: 'The observable response contains a reviewable signal.',
  evidence: { value: 1 },
  nextStep: 'Inspect the returned response.',
};

test('formats explainable check findings and clean results', () => {
  const result = {
    command: 'check',
    summary: 'warning',
    url: 'https://example.com/',
    profile: { label: 'Googlebot' },
    response: { statusCode: 200, finalUrl: 'https://example.com/' },
    html: {
      title: 'Example',
      description: 'Description',
      headings: { h1: ['Example'] },
      textLength: 120,
      wordCount: 20,
      frameworkSigns: [],
    },
    issues: [issue],
    note: 'Returned HTML only.',
  };
  const output = formatHuman(result);
  assert.match(output, /WARNING \[example_warning\]/);
  assert.match(output, /Why:/);
  assert.match(output, /Evidence:/);
  assert.match(output, /Next:/);

  result.summary = 'pass';
  result.issues = [];
  assert.match(formatHuman(result), /No material issues detected/);
});

test('labels compare output as standard and crawler HTTP responses', () => {
  const output = formatHuman({
    command: 'compare',
    summary: 'pass',
    url: 'https://example.com/',
    crawlerProfile: { label: 'GPTBot' },
    browser: { response: { statusCode: 200 }, html: { textLength: 400 } },
    crawler: { response: { statusCode: 200 }, html: { textLength: 400 } },
    difference: {
      textRatio: 1,
      acceptedTextRatio: { minimum: 0.7, maximum: 1.3 },
      titleChanged: false,
      descriptionChanged: false,
      h1Changed: false,
    },
    issues: [],
    note: 'Both sides are HTTP responses. Neither executes JavaScript.',
  });
  assert.match(output, /Standard HTTP/);
  assert.doesNotMatch(output, /Browser HTTP/);
  assert.match(output, /Neither executes JavaScript/);
});

test('formats discovery-file findings with stable codes', () => {
  const output = formatHuman({
    command: 'files',
    summary: 'warning',
    origin: 'https://example.com',
    files: [{
      name: 'robots.txt',
      summary: 'warning',
      url: 'https://example.com/robots.txt',
      statusCode: 200,
      issues: [issue],
    }],
    note: 'Discovery files do not render pages.',
  });
  assert.match(output, /WARNING \[example_warning\]/);
});
