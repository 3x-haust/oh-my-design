import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFrameInput } from '../core/frame/input.ts';
import { writeFrameRecord } from '../core/frame/write.ts';
import { readFrame } from '../core/frame/index.ts';
import { requiredSurfaceCells } from '../core/frame/process-plan.ts';
import { fileReceipt, jsonBytes } from '../core/brief/candidate-data.ts';
import { fixture, frameInput, snapshot, write } from './helpers/phase6-process.ts';

test('Frame v1 remains readable and v2 roundtrips scoped surface/state/view inventory without fictitious marketing tasks', t => {
  const f = fixture(t), current = frameInput();
  const { surfacePlan: _s, validationPlan: _v, accessibilityPlan: _a, ...legacy } = current;
  writeFrameRecord(f.root, parseFrameInput({ ...legacy, schema: 'frame-input-v1' }), f.writer);
  assert.equal(readFrame(f.root)?.surfacePlan, undefined);
  const before = snapshot(f.root);
  assert.throws(() => writeFrameRecord(f.root, parseFrameInput({ ...current, surfacePlan: { ...current.surfacePlan, extra: true } }), f.writer), /exact fields/);
  assert.deepEqual(snapshot(f.root), before);
  writeFrameRecord(f.root, parseFrameInput(current), f.writer);
  assert.deepEqual(readFrame(f.root)?.surfacePlan, current.surfacePlan);
  assert.equal(requiredSurfaceCells(current.surfacePlan).length, 3);
  assert.equal(readFrame(f.root)?.accessibilityPlan?.items[0]?.applicability, 'unknown');
});

test('Frame rejects unknown task/state/view references, false observed research and missing content fixtures atomically', t => {
  const f = fixture(t), valid = frameInput();
  const caseFixture = '.omd/.cache/long-title.json'; write(f.root, caseFixture, jsonBytes({ title: 'A long supplied title for local testing' }));
  const contentCase = { id: 'long-title', kind: 'long-text' as const, fixture: fileReceipt(f.root, caseFixture), contentProfileId: 'long', stateIds: ['initial'], viewIds: ['mobile-390x844@1'], expectationIds: ['title-reflows'], reason: 'CMS titles are variable.' };
  const observed = { id: 'readability', assumption: { claimId: null, text: 'People can read the details.' }, participant: { kind: 'target-user', criteria: 'Instrument players', plannedCount: 3 }, task: { taskIds: [], scenario: 'Read the details.' }, signal: { observable: 'Correct description', successCriterion: 'Terms correctly described', contradictingCriterion: 'Terms misunderstood' }, decisionChanged: { decisionId: 'details', ifSupported: 'Keep', ifContradicted: 'Repair' }, method: 'usability-session', status: 'observed', evidence: [], limitation: null };
  const badSurface = (patch: object) => ({ ...valid, surfacePlan: { ...valid.surfacePlan, surfaces: [{ ...valid.surfacePlan.surfaces[0], ...patch }, valid.surfacePlan.surfaces[1]] } });
  for (const invalid of [badSurface({ taskIds: ['T99'] }), badSurface({ viewIds: ['invented'] }), badSurface({ contentCases: [{ ...contentCase, stateIds: ['unknown'] }] }),
    badSurface({ contentCases: [{ ...contentCase, fixture: { ...contentCase.fixture, sha256: '0'.repeat(64) } }] }),
    { ...valid, validationPlan: { schema: 'validation-plan-v1', items: [observed] } },
    { ...valid, validationPlan: { schema: 'validation-plan-v1', items: [{ ...observed, method: 'automated-probe', status: 'planned' }] } }]) {
    const before = snapshot(f.root);
    assert.throws(() => writeFrameRecord(f.root, parseFrameInput(invalid), f.writer));
    assert.deepEqual(snapshot(f.root), before);
    const good = { ...valid, surfacePlan: { ...valid.surfacePlan, surfaces: [{ ...valid.surfacePlan.surfaces[0], contentCases: [contentCase] }, valid.surfacePlan.surfaces[1]] }, validationPlan: { schema: 'validation-plan-v1', items: [{ ...observed, status: 'not-run', limitation: 'Participants were not available; no human usability result is claimed.' }] } };
    writeFrameRecord(f.root, parseFrameInput(good), f.writer);
    assert.equal(readFrame(f.root)?.validationPlan?.items[0]?.status, 'not-run');
  }
});
