import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MeasurementIndex } from '../core/measure/citations.ts';
import type { VisualMeasurement } from '../core/measure/types.ts';
import {
  assertMeasuredDesignQualityGreen,
  MEASURED_DESIGN_QUALITY_AXES,
  type MeasuredDesignQuality,
  type MeasuredQualityContext,
} from '../core/evidence/final-v2-measured-quality.ts';
import { hasMeasuredSlopReview } from '../core/slop/measured-review.ts';
import { checkCompletionPublicationPrerequisites } from '../core/completion/publication.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
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

test('present malformed and dangling optional records never count as absent', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-integrated-review-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd', 'slop'), { recursive: true });
  const pointer = join(root, '.omd', 'slop', 'latest.json');
  writeFileSync(pointer, '{}\n');
  assert.throws(() => hasMeasuredSlopReview(root), /pointer schema is invalid/);
  rmSync(pointer);
  symlinkSync('missing-pointer.json', pointer);
  assert.throws(() => hasMeasuredSlopReview(root), /pointer is unreadable/);
  rmSync(pointer);
  rmSync(join(root, '.omd', 'slop'), { recursive: true });
  symlinkSync('missing-slop-directory', join(root, '.omd', 'slop'));
  assert.throws(() => hasMeasuredSlopReview(root), /pointer is unreadable/);

  symlinkSync('missing-type-proof.md', join(root, '.omd', 'type-proof.md'));
  const graph = { schema: 'fixture-graph', productionSchema: null, observations: [], buildIdentity: null, sourceSeal: null, workflow: null, referenceDistance: null };
  assert.throws(() => checkCompletionPublicationPrerequisites(root, { graph }, {} as ProjectRunInvocation), /type-proof|stable regular file/);
});
