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
  --json                    print machine-readable JSON
  --fail-on <level>         warning or critical
  --help                    show this help
  --version                 show the package version

This tool checks public responses. It does not predict rankings, indexing, citations,
mentions, or traffic, and it does not use Prerender Buddy's managed rendering service.`;

function parseArgs(args) {
  const options = { userAgent: 'googlebot', timeoutMs: 15_000, json: false, failOn: null };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--json') options.json = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--version' || value === '-v') options.version = true;
    else if (value === '--user-agent') options.userAgent = args[++index];
    else if (value === '--timeout') options.timeoutMs = Number(args[++index]);
    else if (value === '--fail-on') options.failOn = args[++index];
    else if (value.startsWith('-')) throw new Error(`Unknown option "${value}".`);
    else positional.push(value);
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 60_000) {
    throw new Error('--timeout must be an integer between 1000 and 60000.');
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

export async function runCli(args) {
  const { positional, options } = parseArgs(args);
  if (options.help || (!positional.length && !options.version)) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const [command, url] = positional;
  if (!['check', 'compare', 'files'].includes(command)) {
    throw new Error(`Unknown command "${command}". Use check, compare, or files.`);
  }
  if (!url) throw new Error(`The ${command} command requires a URL.`);
  if (positional.length > 2) throw new Error('Only one URL can be checked at a time in v0.1.');

  const runOptions = { userAgent: options.userAgent, timeoutMs: options.timeoutMs };
  const result = command === 'check'
    ? await checkUrl(url, runOptions)
    : command === 'compare'
      ? await compareUrl(url, runOptions)
      : await checkDiscoveryFiles(url, runOptions);

  process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : formatHuman(result)}\n`);
  if (shouldFail(result.summary, options.failOn)) process.exitCode = 1;
}

export { HELP, parseArgs, shouldFail };
