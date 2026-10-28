import assert from 'node:assert/strict';
import test from 'node:test';

import { MeasurementIndex } from '../core/measure/citations.ts';
import type { VisualMeasurement } from '../core/measure/types.ts';
import {
  assertMeasuredCitations,
  assertMeasuredDesignQualityGreen,
  MEASURED_DESIGN_QUALITY_AXES,
  type MeasuredDesignQuality,
  type MeasuredQualityContext,
} from '../core/evidence/final-v2-measured-quality.ts';
import { measuredAdvisoryDispositionContract } from '../core/runtime/trusted-measured-review.ts';

const hash = (digit: string) => digit.repeat(64);
const packetSha256 = hash('1');
const observationSha256 = hash('2');
const measurementId = `vm1:${hash('3')}`;
const findingId = `vf1:${hash('4')}`;
const views = [
  { id: 'desktop', state: 'initial', viewport: { width: 1280, height: 900 }, browserZoom: 1 as const },
  { id: 'mobile', state: 'initial', viewport: { width: 390, height: 844 }, browserZoom: 1 as const },
];
const packet = {
  scope: views,
  captures: views.map((view, index) => ({ viewId: view.id, capture: { path: `capture-${index}.png`, sha256: hash(String(index + 5)) } })),
  findings: [{ id: findingId, severity: 'advisory', axes: ['hierarchy'], viewIds: ['desktop'], measurementIds: [measurementId] }],
  summary: { deterministicVerdict: 'PASS' },
} as unknown as VisualMeasurement;
const index = Object.create(MeasurementIndex.prototype) as MeasurementIndex;
Object.defineProperties(index, {
  packet: { value: (sha256: string) => sha256 === packetSha256 ? packet : assert.fail('unexpected packet') },
  assertAxis: { value: () => undefined },
});
const context = (policy: MeasuredQualityContext['advisoryDispositionPolicy'], external: string[] = []): MeasuredQualityContext => ({
  index,
  requiredViewIds: views.map(view => view.id),
  policySha256: hash('9'),
  advisoryDispositionIds: external,
  advisoryDispositionPolicy: policy,
  bindings: views.map((view, index) => ({
    observationSha256,
    captureSha256: packet.captures[index]!.capture.sha256,
    packetSha256,
    viewId: view.id,
    state: view.state,
    browserZoom: view.browserZoom,
  })),
});
function quality(): MeasuredDesignQuality {
  return {
    schema: 'design-quality-contract-v2',
    axes: MEASURED_DESIGN_QUALITY_AXES.map(axis => ({
      axis,
      verdict: 'GREEN',
      score: 4,
      crossViewport: 'preserved',
      criticalFailure: null,
      evidence: views.map((view, index) => ({
        observationSha256,
        captureSha256: packet.captures[index]!.capture.sha256,
        viewId: view.id,
        state: view.state,
        regionSubjectIds: [],
        packetSha256,
        measurementIds: [measurementId],
        visibleCondition: 'The isolated reviewer inspected the authenticated capture.',
        userConsequence: 'The task hierarchy remains clear.',
      })),
    })),
  };
}

test('integrated final review judges advisory findings without a separate form while preserving hard floors', () => {
  const contract = measuredAdvisoryDispositionContract(context('integrated-final-review'), [{ path: 'packet.json', sha256: packetSha256 }]);
  assert.equal(contract.policy, 'integrated-final-review');
  assert.deepEqual(contract.findings, [{ packetSha256, findingId, axes: ['hierarchy'], viewIds: ['desktop'], measurementIds: [measurementId] }]);
  assert.equal(assertMeasuredDesignQualityGreen(quality(), context('integrated-final-review')).axes.length, 11);
  assert.throws(() => assertMeasuredDesignQualityGreen(quality(), context('separate-slop-review')), /validated scoped disposition/);
  const rejected = quality();
  rejected.axes[0]!.verdict = 'RED';
  assert.throws(() => assertMeasuredDesignQualityGreen(rejected, context('integrated-final-review')), /DESIGN_QUALITY_AXIS_RED/);
  const lowScore = quality();
  lowScore.axes.find(axis => axis.axis === 'beautyDesirability')!.score = 2;
  assert.throws(() => assertMeasuredDesignQualityGreen(lowScore, context('integrated-final-review')), /DESIGN_QUALITY_AXIS_RED/);
  const oldVerdict = packet.summary.deterministicVerdict;
  try {
    assert.equal(Reflect.set(packet.summary, 'deterministicVerdict', 'RED'), true);
    assert.throws(() => assertMeasuredDesignQualityGreen(quality(), context('integrated-final-review')), /deterministic RED/);
  } finally { Reflect.set(packet.summary, 'deterministicVerdict', oldVerdict); }
  assert.equal(assertMeasuredDesignQualityGreen(quality(), context('separate-slop-review', [findingId])).axes.length, 11);
});

test('every view is cited by some axis and every axis cites the at-rest views; a RED axis is left to publication', () => {
  assertMeasuredCitations(quality(), context('integrated-final-review'));
  // A view no axis cites was not looked at.
  const unseen = quality();
  for (const axis of unseen.axes) axis.evidence = axis.evidence.filter(row => row.viewId !== 'mobile');
  assert.throws(() => assertMeasuredCitations(unseen, context('integrated-final-review')),
    /every required view\/state is cited by at least one axis\. Not cited by any axis: mobile at rest\. Add a row/);
  // An axis that skips an at-rest view still has to cite it, though another axis covers that view.
  const thin = quality();
  thin.axes[0]!.evidence = thin.axes[0]!.evidence.filter(row => row.viewId !== 'mobile');
  assert.throws(() => assertMeasuredCitations(thin, context('integrated-final-review')), /baseline initial desktop\/mobile evidence required/);
  // A RED judgment is not a format to correct: its citations are not demanded here.
  thin.axes[0]!.verdict = 'RED';
  assertMeasuredCitations(thin, context('integrated-final-review'));
});
