import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateTokenCommit } from '../core/tokens/contract.ts';
import { selectedBaseTokens, validatePrimitiveOverrides } from '../core/tokens/minimal.ts';
import { extendSelectedTokens, resolveSelectedTokens, assertRepresentativeTokenAssignments } from '../core/tokens/resolve.ts';
import { publishCandidatePacket, publishCandidateSelection, readCurrentCandidateSelection } from '../core/brief/candidate-choice.ts';
import { fixture, renderedSet, seed, snapshot, userChoice } from './helpers/phase6-process.ts';

test('minimal named seed permits one needed text role without accent, rung or display quotas; aliases and overrides stay typed', t => {
  const f = fixture(t), before = snapshot(f.root);
  assert.throws(() => validateTokenCommit({ ...seed, semantic: { text: { ref: 'missing' } } }), /dangling/);
  assert.deepEqual(snapshot(f.root), before);
  assert.equal(validateTokenCommit(seed).schema, 'token-commit-v3');
  assert.throws(() => validatePrimitiveOverrides(seed, { size: { type: 'number', value: 2, unit: 'unitless' } }), /type\/unit/);
  assert.deepEqual(snapshot(f.root), before);
  const selected = selectedBaseTokens(seed, { size: { type: 'number', value: 18, unit: 'px' } });
  assert.equal(selected.primitives.size?.value, 18);
  assert.equal(seed.primitives.size?.value, 16);
});

test('only component/state-needed additions publish; collisions, retargeting, missing need and disguised role remaps refuse', async t => {
  const f = fixture(t), set = await renderedSet(f), packet = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  publishCandidateSelection(f.root, userChoice(f, packet), f.writer, f.invocation);
  const baseBytes = readFileSync(join(f.root, '.omd/tokens.json')), original = readCurrentCandidateSelection(f.root);
  const addition = (id: string) => ({ schema: 'token-extensions-v1', primitives: { [id]: { type: 'color', value: '#bb0000' } }, semantic: {}, textStyles: {}, neededBy: [{ tokenId: `primitives.${id}`, surfaceId: 'details', stateId: 'initial', componentId: 'details' }] });
  const invalid = [addition('ink'), { ...addition('error'), neededBy: [] }, { ...addition('error'), neededBy: [{ tokenId: 'primitives.error', surfaceId: 'invented', stateId: 'initial', componentId: 'details' }] },
    { schema: 'token-extensions-v1', primitives: {}, semantic: { text: { ref: 'paper' } }, textStyles: {}, neededBy: [{ tokenId: 'semantic.text', surfaceId: 'details', stateId: 'initial', componentId: 'details' }] }];
  for (const [index, value] of invalid.entries()) {
    const before = snapshot(f.root);
    assert.throws(() => extendSelectedTokens(f.root, value, f.writer, f.invocation));
    assert.deepEqual(snapshot(f.root), before);
    const result = extendSelectedTokens(f.root, addition(`error${index}`), f.writer, f.invocation);
    assert.notEqual(result.effectiveTokensSha256, result.baseTokensSha256);
    assert.equal(readCurrentCandidateSelection(f.root).inputDigest, original.inputDigest);
  }
  assert.deepEqual(readFileSync(join(f.root, '.omd/tokens.json')), baseBytes);
  assert.equal(Object.keys(resolveSelectedTokens(f.root).extensions!.primitives).length, 4);
  const before = snapshot(f.root);
  assert.throws(() => assertRepresentativeTokenAssignments({ heading: 'body' }, { heading: 'body2' }), /STALE_DIRECTION/);
  assert.deepEqual(snapshot(f.root), before);
  assertRepresentativeTokenAssignments({ heading: 'body' }, { heading: 'body' });
});
