import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs, shouldFail } from '../src/cli.js';

test('parses common CI options', () => {
  const result = parseArgs([
    'check',
    'https://example.com',
    '--user-agent',
    'gptbot',
    '--timeout',
    '5000',
    '--json',
    '--fail-on',
    'critical',
  ]);

  assert.deepEqual(result.positional, ['check', 'https://example.com']);
  assert.equal(result.options.userAgent, 'gptbot');
  assert.equal(result.options.timeoutMs, 5000);
  assert.equal(result.options.json, true);
  assert.equal(result.options.failOn, 'critical');
});

test('rejects unsafe timeout and failure threshold values', () => {
  assert.throws(() => parseArgs(['check', 'example.com', '--timeout', '10']), /between 1000 and 60000/);
  assert.throws(() => parseArgs(['check', 'example.com', '--fail-on', 'pass']), /warning or critical/);
});

test('maps summaries to CI thresholds', () => {
  assert.equal(shouldFail('warning', null), false);
  assert.equal(shouldFail('warning', 'critical'), false);
  assert.equal(shouldFail('warning', 'warning'), true);
  assert.equal(shouldFail('critical', 'critical'), true);
});
