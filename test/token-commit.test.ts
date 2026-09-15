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

const responsive = (overrides = {}) => commit({
  schema: 'token-commit-v2',
  typeScale: [14, 18, 24, 32, 48, 72],
  responsiveTypeScales: [{ maxWidth: 640, typeScale: [14, 18, 24, 36, 42] }],
  ...overrides,
});

test('responsive scales validate independently; the same union is still invalid as one scale', () => {
  assert.doesNotThrow(() => validateTokenCommit(responsive()));
  assert.throws(() => validateTokenCommit(commit({ typeScale: [14, 18, 24, 32, 36, 42, 48, 72] })), /below the/);
});

test('responsive drift uses the first inclusive width cap and never a union', () => {
  const system = validateTokenCommit(responsive({ responsiveTypeScales: [
    { maxWidth: 640, typeScale: [14, 18, 24, 36, 42] },
    { maxWidth: 1024, typeScale: [14, 18, 24, 40, 64] },
  ] }));
  const observed = (size: number) => ({ typeScale: [size], spacingScale: [8] });
  assert.equal(checkTokenDrift(system, observed(42), 640), null);
  assert.equal(checkTokenDrift(system, observed(64), 641), null);
  assert.equal(checkTokenDrift(system, observed(64), 1024), null);
  assert.equal(checkTokenDrift(system, observed(72), 1025), null);
  assert.equal(checkTokenDrift(system, observed(72), 390)?.id, 'TOKEN-DRIFT');
  assert.equal(checkTokenDrift(system, observed(42), 1280)?.id, 'TOKEN-DRIFT');
  for (const width of [undefined, 0, -1, NaN, Infinity]) {
    assert.throws(() => checkTokenDrift(system, observed(42), width), /viewport width/);
  }
});

test('every responsive context retains the existing scale floors and closed shape', () => {
  for (const typeScale of [[14, 18], [14, 15, 24, 42], [14, 18, 24, 24], [14, 18, 24, Infinity], [14, 17, 21, 26]]) {
    assert.throws(() => validateTokenCommit(responsive({ responsiveTypeScales: [{ maxWidth: 640, typeScale }] })), TokenCommitError);
  }
  for (const responsiveTypeScales of [[], null, [{ maxWidth: 0, typeScale: [14, 18, 24, 42] }],
    [{ maxWidth: Infinity, typeScale: [14, 18, 24, 42] }],
    [{ maxWidth: 640, typeScale: [14, 18, 24, 42], extra: true }],
    [640, 640].map(maxWidth => ({ maxWidth, typeScale: [14, 18, 24, 42] })),
    [640, 390].map(maxWidth => ({ maxWidth, typeScale: [14, 18, 24, 42] })),
  ]) assert.throws(() => validateTokenCommit(responsive({ responsiveTypeScales })), TokenCommitError);
  assert.throws(() => validateTokenCommit(responsive({ typeScale: [14, 15, 24, 42] })), TokenCommitError);
  assert.throws(() => validateTokenCommit(responsive({ schema: TOKEN_COMMIT_SCHEMA })), /unknown or missing keys/);
  assert.doesNotThrow(() => validateTokenCommit(responsive({ register: 'product', responsiveTypeScales: [{ maxWidth: 640, typeScale: [14, 17, 21, 26] }] })));
});
