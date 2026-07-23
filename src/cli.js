import { readFileSync } from 'node:fs';
import { checkUrl } from './check.js';
import { compareUrl } from './compare.js';
import { checkDiscoveryFiles } from './discovery.js';
import { formatHuman } from './format.js';
import { USER_AGENT_PROFILES } from './profiles.js';

const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const HELP = `Prerender Buddy CLI

Usage:
  prerenderbuddy check <url> [options]
  prerenderbuddy compare <url> [options]
  prerenderbuddy files <url> [options]

Options:
  --user-agent <name>       browser, googlebot, bingbot, gptbot, or claudebot
  --timeout <milliseconds>  request timeout from 1000 to 60000 (default: 15000)
  --text-ratio-threshold <number>
                            compare text-volume tolerance from 0.01 to 0.99 (default: 0.30)
  --json                    print machine-readable JSON
  --fail-on <level>         warning or critical
  --help                    show this help
  --version                 show the package version

This tool checks public responses. It does not predict rankings, indexing, citations,
mentions, or traffic, and it does not use Prerender Buddy's managed rendering service.`;

function optionValue(args, index, option) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseArgs(args) {
  const options = {
    userAgent: 'googlebot',
    timeoutMs: 15_000,
    textRatioThreshold: 0.3,
    json: false,
    failOn: null,
  };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--json') options.json = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--version' || value === '-v') options.version = true;
    else if (value === '--user-agent') options.userAgent = optionValue(args, index++, value);
    else if (value === '--timeout') options.timeoutMs = Number(optionValue(args, index++, value));
    else if (value === '--text-ratio-threshold') {
      options.textRatioThreshold = Number(optionValue(args, index++, value));
    } else if (value === '--fail-on') options.failOn = optionValue(args, index++, value);
    else if (value.startsWith('-')) throw new Error(`Unknown option "${value}".`);
    else positional.push(value);
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 60_000) {
    throw new Error('--timeout must be an integer between 1000 and 60000.');
  }
  if (!Number.isFinite(options.textRatioThreshold)
    || options.textRatioThreshold < 0.01
    || options.textRatioThreshold > 0.99) {
    throw new Error('--text-ratio-threshold must be a number between 0.01 and 0.99.');
  }
  if (options.failOn && !['warning', 'critical'].includes(options.failOn)) {
    throw new Error('--fail-on must be warning or critical.');
  }
  if (!USER_AGENT_PROFILES[options.userAgent]) {
    throw new Error(`Unknown user-agent profile "${options.userAgent}".`);
  }

  return { positional, options };
}

function shouldFail(summary, threshold) {
  if (!threshold) return false;
  if (threshold === 'warning') return ['warning', 'critical'].includes(summary);
  return summary === 'critical';
}

export async function runCli(args, runtime = {}) {
  return runCliWithRuntime(args, runtime);
}

export async function runCliWithRuntime(args, runtime = {}) {
  const { positional, options } = parseArgs(args);
  const write = runtime.write || ((value) => process.stdout.write(value));
  const setExitCode = runtime.setExitCode || ((value) => { process.exitCode = value; });
  const handlers = {
    check: checkUrl,
    compare: compareUrl,
    files: checkDiscoveryFiles,
    ...runtime.handlers,
  };
  if (options.help || (!positional.length && !options.version)) {
    write(`${HELP}\n`);
    return;
  }
  if (options.version) {
    write(`${VERSION}\n`);
    return;
  }

  const [command, url] = positional;
  if (!['check', 'compare', 'files'].includes(command)) {
    throw new Error(`Unknown command "${command}". Use check, compare, or files.`);
  }
  if (!url) throw new Error(`The ${command} command requires a URL.`);
  if (positional.length > 2) throw new Error('Only one URL can be checked at a time in v0.1.');

  const runOptions = {
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs,
    textRatioThreshold: options.textRatioThreshold,
  };
  const result = await handlers[command](url, runOptions);

  write(`${options.json ? JSON.stringify(result, null, 2) : formatHuman(result)}\n`);
  if (shouldFail(result.summary, options.failOn)) setExitCode(1);
}

export function executionErrorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = /timed out/i.test(message)
    ? 'timeout'
    : /private|blocked network|local and private|credentials|only http and https/i.test(message)
      ? 'unsafe_target'
      : /unknown|requires|must be|only one URL|public URL is required|invalid url/i.test(message)
        ? 'invalid_input'
        : 'request_failed';
  return {
    command: null,
    summary: 'error',
    error: { code, message },
  };
}

export { HELP, parseArgs, shouldFail };
