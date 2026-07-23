#!/usr/bin/env node

import { executionErrorResult, runCli } from '../src/cli.js';

runCli(process.argv.slice(2)).catch((error) => {
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(executionErrorResult(error), null, 2)}\n`);
  } else {
    process.stderr.write(`Prerender Buddy check failed: ${error.message}\n`);
  }
  process.exitCode = 2;
});
