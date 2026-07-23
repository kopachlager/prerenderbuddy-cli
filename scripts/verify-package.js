import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
assert.equal(packageLock.name, packageJson.name, 'package-lock.json name must match package.json');
assert.equal(packageLock.version, packageJson.version, 'package-lock.json version must match package.json');
assert.equal(packageLock.packages[''].version, packageJson.version, 'lockfile root version must match package.json');

const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const [manifest] = JSON.parse(result.stdout);
const files = manifest.files.map((entry) => entry.path).sort();
const required = [
  'LICENSE',
  'NOTICE',
  'README.md',
  'ROADMAP.md',
  'SECURITY.md',
  'bin/prerenderbuddy.js',
  'package.json',
  'src/index.js',
];

for (const file of required) assert.ok(files.includes(file), `Package is missing ${file}`);
for (const file of files) {
  assert.ok(
    required.includes(file) || file.startsWith('src/'),
    `Unexpected file in npm package: ${file}`,
  );
}

process.stdout.write(`Verified ${files.length} package files for ${manifest.name}@${manifest.version}.\n`);
