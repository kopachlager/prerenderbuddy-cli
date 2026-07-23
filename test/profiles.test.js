import assert from 'node:assert/strict';
import test from 'node:test';
import { getUserAgentProfile, USER_AGENT_PROFILES } from '../src/profiles.js';

test('exposes every documented crawler profile as a transparent constant', () => {
  assert.deepEqual(Object.keys(USER_AGENT_PROFILES), [
    'browser',
    'googlebot',
    'bingbot',
    'gptbot',
    'claudebot',
  ]);
  for (const name of Object.keys(USER_AGENT_PROFILES)) {
    const profile = getUserAgentProfile(name.toUpperCase());
    assert.equal(profile.name, name);
    assert.ok(profile.label);
    assert.ok(profile.value);
  }
});

test('rejects unknown crawler profiles with the supported names', () => {
  assert.throws(
    () => getUserAgentProfile('made-up-bot'),
    /browser, googlebot, bingbot, gptbot, claudebot/,
  );
});
