import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  executionErrorResult,
  parseArgs,
  runCli,
  shouldFail,
} from '../src/cli.js';

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
    '--text-ratio-threshold',
    '0.2',
  ]);

  assert.deepEqual(result.positional, ['check', 'https://example.com']);
  assert.equal(result.options.userAgent, 'gptbot');
  assert.equal(result.options.timeoutMs, 5000);
  assert.equal(result.options.json, true);
  assert.equal(result.options.failOn, 'critical');
  assert.equal(result.options.textRatioThreshold, 0.2);
});

test('rejects unsafe timeout and failure threshold values', () => {
  assert.throws(() => parseArgs(['check', 'example.com', '--timeout', '10']), /between 1000 and 60000/);
  assert.throws(() => parseArgs(['check', 'example.com', '--fail-on', 'pass']), /warning or critical/);
  assert.throws(() => parseArgs(['check', 'example.com', '--text-ratio-threshold', '2']), /between 0.01 and 0.99/);
  assert.throws(() => parseArgs(['check', 'example.com', '--user-agent']), /requires a value/);
  assert.throws(() => parseArgs(['check', 'example.com', '--user-agent', 'unknown']), /Unknown user-agent/);
  assert.throws(() => parseArgs(['check', 'example.com', '--unknown']), /Unknown option/);
});

test('maps summaries to CI thresholds', () => {
  assert.equal(shouldFail('warning', null), false);
  assert.equal(shouldFail('warning', 'critical'), false);
  assert.equal(shouldFail('warning', 'warning'), true);
  assert.equal(shouldFail('critical', 'critical'), true);
});

test('prints help and version without running a command', async () => {
  const output = [];
  await runCli(['--help'], { write: (value) => output.push(value) });
  assert.match(output.join(''), /Usage:/);
  assert.match(output.join(''), /text-ratio-threshold/);

  output.length = 0;
  await runCli(['--version'], { write: (value) => output.push(value) });
  assert.match(output.join(''), /^\d+\.\d+\.\d+\n$/);
});

test('runs every command in JSON mode without human-readable output', async () => {
  for (const command of ['check', 'compare', 'files']) {
    const output = [];
    const exitCodes = [];
    await runCli([command, 'https://example.com', '--json', '--fail-on', 'warning'], {
      write: (value) => output.push(value),
      setExitCode: (value) => exitCodes.push(value),
      handlers: {
        [command]: async () => ({ command, summary: 'warning', issues: [] }),
      },
    });
    const parsed = JSON.parse(output.join(''));
    assert.equal(parsed.command, command);
    assert.deepEqual(exitCodes, [1]);
  }
});

test('clean checks leave the process exit code unchanged', async () => {
  const exitCodes = [];
  await runCli(['check', 'https://example.com', '--json', '--fail-on', 'critical'], {
    write: () => {},
    setExitCode: (value) => exitCodes.push(value),
    handlers: {
      check: async () => ({ command: 'check', summary: 'pass' }),
    },
  });
  assert.deepEqual(exitCodes, []);
});

test('passes compare thresholds to the command handler', async () => {
  let received;
  await runCli(['compare', 'https://example.com', '--json', '--text-ratio-threshold', '0.15'], {
    write: () => {},
    handlers: {
      compare: async (_url, options) => {
        received = options;
        return { command: 'compare', summary: 'pass' };
      },
    },
  });
  assert.equal(received.textRatioThreshold, 0.15);
});

test('rejects invalid commands, missing URLs, and extra positional arguments', async () => {
  await assert.rejects(() => runCli(['unknown', 'https://example.com']), /Unknown command/);
  await assert.rejects(() => runCli(['check']), /requires a URL/);
  await assert.rejects(() => runCli(['check', 'https://example.com', 'extra']), /Only one URL/);
});

test('classifies execution errors for machine-readable output', () => {
  assert.equal(executionErrorResult(new Error('Request timed out after 1000 ms.')).error.code, 'timeout');
  assert.equal(executionErrorResult(new Error('The URL resolves to a private or blocked network address.')).error.code, 'unsafe_target');
  assert.equal(executionErrorResult(new Error('Unknown command "bad".')).error.code, 'invalid_input');
  assert.equal(executionErrorResult(new Error('socket closed')).error.code, 'request_failed');
});

test('the executable returns JSON-only output and exit code 2 for invalid JSON-mode input', () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../bin/prerenderbuddy.js', import.meta.url)),
    'check',
    'file:///etc/passwd',
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.summary, 'error');
  assert.equal(parsed.error.code, 'unsafe_target');
});

test('the executable keeps human execution errors on stderr', () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../bin/prerenderbuddy.js', import.meta.url)),
    'unknown',
    'https://example.com',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Prerender Buddy check failed: Unknown command/);
});
