import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_TYPE_RUNGS,
  TOKEN_COMMIT_SCHEMA,
  TokenCommitError,
  checkTokenDrift,
  validateTokenCommit,
} from '../core/tokens/contract.ts';

const commit = (overrides = {}) => ({
  schema: TOKEN_COMMIT_SCHEMA,
  register: 'marketing',
  typeScale: [14, 18, 24, 40, 72],
  spacingScale: [4, 8, 16, 32, 64],
  colorRoles: { bg: '#0b0b0d', fg: '#ecebe4', accent: '#d8ff2e' },
  fontRoles: { text: 'Space Grotesk', mono: 'JetBrains Mono' },
  ...overrides,
});

test('a committed system with real range validates', () => {
  const result = validateTokenCommit(commit());
  assert.equal(result.schema, 'token-commit-v1');
  assert.equal(result.typeScale.length, 5);
  assert.equal(result.colorRoles.accent, '#d8ff2e');
});

test('the two-rung scale measured on the real example is rejected', () => {
  // The shipped page rendered [12, 16]: two adjacent body sizes, no hierarchy, no display moment.
  assert.throws(() => validateTokenCommit(commit({ typeScale: [12, 16] })), /needs at least 4 rungs/);
});

test('adjacent rungs that differ by less than the minimum ratio are rejected', () => {
  assert.throws(() => validateTokenCommit(commit({ typeScale: [14, 15, 24, 40, 72] })), /differ by 1\.07×/);
});

test('a persuasion register needs a display moment; quiet and product do not', () => {
  const flat = { typeScale: [14, 17, 21, 26] }; // 1.86× span
  assert.throws(() => validateTokenCommit(commit(flat)), /needs a display moment/);
  assert.doesNotThrow(() => validateTokenCommit(commit({ ...flat, register: 'product' })));
  assert.doesNotThrow(() => validateTokenCommit(commit({ ...flat, register: 'quiet' })));
});

test('ladders must ascend without duplicates and carry enough rungs', () => {
  assert.throws(() => validateTokenCommit(commit({ typeScale: [14, 24, 24, 40, 72] })), /must ascend with no duplicates/);
  assert.throws(() => validateTokenCommit(commit({ spacingScale: [4, 8, 16] })), /spacingScale needs at least 4 rungs/);
  assert.throws(() => validateTokenCommit(commit({ typeScale: Array.from({ length: MIN_TYPE_RUNGS - 1 }, (_u, i) => 14 * 1.5 ** i) })), /needs at least/);
});

test('a palette without a committed accent is rejected, and roles must be non-empty', () => {
  assert.throws(() => validateTokenCommit(commit({ colorRoles: { bg: '#000', fg: '#fff' } })), /must name a `accent` role/);
  assert.throws(() => validateTokenCommit(commit({ fontRoles: {} })), /must name at least one role/);
  assert.throws(() => validateTokenCommit(commit({ colorRoles: { accent: '  ' } })), /non-empty string/);
});

test('schema and key shape are enforced', () => {
  assert.throws(() => validateTokenCommit(commit({ schema: 'token-commit-v2' })), TokenCommitError);
  assert.throws(() => validateTokenCommit({ ...commit(), extra: 1 }), /unknown or missing keys/);
});

test('checkTokenDrift catches values that landed off the committed ladders', () => {
  const system = validateTokenCommit(commit());
  assert.equal(checkTokenDrift(system, { typeScale: [14, 24, 72], spacingScale: [8, 32] }), null);
  const drift = checkTokenDrift(system, { typeScale: [14, 15, 24], spacingScale: [8, 13] });
  assert.equal(drift?.id, 'TOKEN-DRIFT');
  assert.match(drift!.message, /type sizes 15 are not on the committed scale/);
  assert.match(drift!.message, /spacing steps 13 are not on the committed scale/);
});
