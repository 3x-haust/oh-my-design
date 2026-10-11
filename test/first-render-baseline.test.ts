import assert from 'node:assert/strict';
import test from 'node:test';
import { firstRenderActiveBaselines, parseFirstRenderBaselines,
  validateFirstRenderBaselineImages } from '../core/design/first-render-baseline.ts';
import { type FirstRenderFinding } from '../core/design/first-render-review-contract.ts';
import { sha256 } from '../core/ref/board-artifacts.ts';

const finding: FirstRenderFinding = {
  id: 'action', viewport: 'mobile', axis: 'usability', repairScope: 'surface',
  observation: 'The action label wraps.', consequence: 'The action is hard to read.',
  repairCriterion: 'Keep the whole action label readable.',
};
const bytes = Buffer.from('original mobile pixels');
const capture = { viewport: 'mobile' as const, captureSha256: sha256(bytes) };
const baseline = { id: finding.id, reviewSha256: 'a'.repeat(64), captures: [capture] };
const render = { ...capture, role: 'repair-baseline', width: 390, height: 844, pngBase64: bytes.toString('base64') };
const evidence = () => ({ priorCriteria: [finding], priorBaselines: [baseline], priorRenders: [render] });

test('unresolved criteria keep their origin while newly introduced criteria bind the current review', () => {
  const currentCapture = { viewport: 'mobile' as const, captureSha256: 'c'.repeat(64) };
  const introduced = { ...finding, id: 'other-action' };
  assert.deepEqual(firstRenderActiveBaselines([finding, introduced], [baseline], {
    sha256: 'b'.repeat(64), captures: [currentCapture],
  }), [baseline, { id: introduced.id, reviewSha256: 'b'.repeat(64), captures: [currentCapture] }]);
  assert.deepEqual(firstRenderActiveBaselines([], [baseline], { sha256: 'b'.repeat(64), captures: [currentCapture] }), []);
});

test('baseline bindings cover exactly the pending criteria and their required viewports', () => {
  assert.deepEqual(parseFirstRenderBaselines([baseline], [finding]), [baseline]);
  assert.deepEqual(parseFirstRenderBaselines([], []), []);
  assert.throws(() => parseFirstRenderBaselines([], [finding]), /coverage/);
  assert.throws(() => parseFirstRenderBaselines([{ ...baseline, id: 'unknown' }], [finding]), /criterion/);
  assert.throws(() => parseFirstRenderBaselines([baseline], [{ ...finding, viewport: 'both' }]), /viewports/);
  assert.throws(() => parseFirstRenderBaselines([baseline, baseline], [finding, { ...finding, id: 'second' }]), /criteria/);
});

test('shared baseline pixels are delivered once and remain bound to the original bytes', () => {
  assert.equal(validateFirstRenderBaselineImages(evidence()), 1);
  assert.equal(validateFirstRenderBaselineImages({
    priorCriteria: [finding, { ...finding, id: 'second' }],
    priorBaselines: [baseline, { ...baseline, id: 'second' }], priorRenders: [render],
  }), 1);
  assert.throws(() => validateFirstRenderBaselineImages({ ...evidence(), priorRenders: [] }), /images/);
  assert.throws(() => validateFirstRenderBaselineImages({
    ...evidence(), priorRenders: [{ ...render, pngBase64: Buffer.from('current target pixels').toString('base64') }],
  }), /digest/);
  assert.throws(() => validateFirstRenderBaselineImages({
    ...evidence(), priorRenders: [{ ...render, captureSha256: 'd'.repeat(64) }],
  }), /binding/);
  assert.throws(() => validateFirstRenderBaselineImages({
    ...evidence(), priorRenders: [{ ...render, role: 'selected-first-party-target' }],
  }), /viewport/);
  assert.throws(() => validateFirstRenderBaselineImages({
    ...evidence(), priorRenders: [{ ...render, width: 1280 }],
  }), /viewport/);
});
