import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicUrl, isBlockedIp, normalizePublicUrl } from '../src/url-safety.js';

test('normalizes a hostname to HTTPS', () => {
  assert.equal(normalizePublicUrl('example.com/path#section'), 'https://example.com/path');
});

test('rejects unsafe schemes and credentials', () => {
  assert.throws(() => normalizePublicUrl('file:///etc/passwd'), /Only http and https/);
  assert.throws(() => normalizePublicUrl('https://user:pass@example.com'), /credentials/);
});

test('recognizes representative blocked and public addresses', () => {
  assert.equal(isBlockedIp('127.0.0.1'), true);
  assert.equal(isBlockedIp('10.20.30.40'), true);
  assert.equal(isBlockedIp('169.254.1.1'), true);
  assert.equal(isBlockedIp('::1'), true);
  assert.equal(isBlockedIp('fc00::1'), true);
  assert.equal(isBlockedIp('fe80::1'), true);
  assert.equal(isBlockedIp('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIp('8.8.8.8'), false);
  assert.equal(isBlockedIp('2606:4700:4700::1111'), false);
  assert.equal(isBlockedIp('not-an-ip'), true);
});

test('validates all DNS answers', async () => {
  await assert.rejects(
    () => assertPublicUrl('https://example.test', async () => [
      { address: '8.8.8.8' },
      { address: '127.0.0.1' },
    ]),
    /private or blocked/,
  );

  const value = await assertPublicUrl('https://example.test', async () => [{ address: '8.8.8.8' }]);
  assert.equal(value, 'https://example.test/');
});

test('rejects local hostnames and direct private addresses', async () => {
  await assert.rejects(() => assertPublicUrl('http://localhost:3000'), /Local and private/);
  await assert.rejects(() => assertPublicUrl('http://127.0.0.1'), /private or blocked/);
  await assert.rejects(() => assertPublicUrl('http://10.0.0.1'), /private or blocked/);
});

test('rejects empty DNS answers', async () => {
  await assert.rejects(
    () => assertPublicUrl('https://example.test', async () => []),
    /private or blocked/,
  );
});
