import assert from 'node:assert/strict';
import test from 'node:test';
import { redactObservationEvidence } from '../core/runtime/observation.ts';

test('credentials are redacted from observation evidence; finding codes stay readable', () => {
  const redacted = redactObservationEvidence({
    findings: ['required-action-unavailable', 'primary-control-missing-from-entry'],
    note: 'token ghp_a1b2c3d4e5f6g7h8i9j0k1l2m3 and mail someone@example.com',
  }) as { findings: string[]; note: string };
  assert.deepEqual(redacted.findings, ['required-action-unavailable', 'primary-control-missing-from-entry']);
  assert.doesNotMatch(redacted.note, /ghp_a1b2c3d4e5f6g7h8i9j0k1l2m3/);
  assert.doesNotMatch(redacted.note, /someone@example\.com/);
});

test('a red measurement says, counted, why text went unmeasured and what lets it be read', async () => {
  const { measurementRepairHints } = await import('../core/evidence/final-v2-measurement.ts');
  const finding = (reasons: string[]) => ({ code: 'MEASUREMENT_INCOMPLETE', observed: { value: JSON.stringify(reasons.map((reason, index) => ({ reason, subjectId: `s${index}` }))) } });
  const hint = measurementRepairHints([finding(['ancestor-opacity', 'ancestor-opacity', 'occluded-text']), finding(['ancestor-opacity,opaque-content'])]);
  assert.match(hint, /ancestor-opacity ×3: .*prefers-reduced-motion.*colour rather than opacity/);
  assert.match(hint, /occluded-text ×1/);
  assert.equal(measurementRepairHints([{ code: 'TEXT_CONTRAST_FAIL', observed: { value: '[]' } }]), '');
  // An unstable capture names the view and whether its pixels moved or only something unseen changed.
  const stability = (status: string, before: string, after: string) => ({ status, beforePixelSha256: before, afterPixelSha256: after });
  const unstable = measurementRepairHints([finding(['unstable-capture', 'unstable-capture'])], [
    { viewId: 'desktop-1280x900@1', stability: stability('unstable', 'a', 'b') },
    { viewId: 'mobile-390x844@1:outcome-1', stability: stability('unstable', 'c', 'c') },
    { viewId: 'mobile-390x844@1', stability: stability('stable', 'd', 'd') },
  ], [{ id: 'desktop-1280x900@1', state: 'initial' }, { id: 'mobile-390x844@1:outcome-1', state: 'open-install-tabs' }]);
  assert.match(unstable, /Unstable views: desktop-1280x900 at rest \(pixels changed between two shots\); mobile-390x844 after open-install-tabs \(pixels held, layout or text changed/);
  assert.doesNotMatch(unstable, /mobile-390x844 at rest/);
  // Text below its contrast threshold is named with its ratio, once per text, lowest first.
  const contrast = measurementRepairHints([
    { code: 'TEXT_CONTRAST_FAIL', subjectIds: ['v1:m1', 'v1:m2'], observed: { value: JSON.stringify([{ ratio: 4.49, threshold: 4.5 }, { ratio: 3.1, threshold: 4.5 }]) } },
    { code: 'TEXT_CONTRAST_FAIL', subjectIds: ['v2:m1'], observed: { value: JSON.stringify([{ ratio: 4.48, threshold: 4.5 }]) } },
  ], [], [], [{ id: 'v1:m1', textExcerpt: 'FROM PROMPT TO PIXELS' }, { id: 'v1:m2', textExcerpt: '설치 명령' }, { id: 'v2:m1', textExcerpt: 'FROM PROMPT TO PIXELS' }]);
  assert.match(contrast, /Text below its contrast threshold: "설치 명령" 3\.10:1 \(needs 4\.5:1\); "FROM PROMPT TO PIXELS" 4\.48:1/);
  assert.equal(contrast.match(/FROM PROMPT TO PIXELS/g)?.length, 1);
});

test('a refused final review says which axes the reviewer marked red and why', async () => {
  const { redAxes } = await import('../core/runtime/native-final-publication.ts');
  const result = (axes: unknown[]) => ({ authority: { receipt: { finalMessage: JSON.stringify({ designQuality: { axes } }) } } });
  const said = redAxes([result([
    { axis: 'typography', verdict: 'RED', criticalFailure: 'Primary installation commands shrink to 11px on mobile.' },
    { axis: 'spacingRhythm', verdict: 'GREEN', criticalFailure: null },
  ])]);
  assert.match(said, /reviewer marked red: typography: Primary installation commands shrink to 11px on mobile\./);
  assert.doesNotMatch(said, /spacingRhythm/);
  assert.equal(redAxes([{ authority: { receipt: { finalMessage: 'not json' } } }]), '');
  // A red axis without a stated failure is explained by the findings that name it.
  const viaFindings = redAxes([{ authority: { receipt: { finalMessage: JSON.stringify({
    designQuality: { axes: [{ axis: 'spacingRhythm', verdict: 'RED', criticalFailure: null }, { axis: 'hierarchy', verdict: 'GREEN', criticalFailure: null }] },
    findings: [{ axes: ['spacingRhythm', 'usability'], visibleCondition: 'The mobile copied message overlaps the command by 7px.', repairCriterion: 'Give the confirmation its own row.' },
      { axes: ['hierarchy'], visibleCondition: 'Unrelated note.' }],
  }) } } }]);
  assert.match(viaFindings, /reviewer marked red: spacingRhythm: The mobile copied message overlaps the command by 7px\. Repair: Give the confirmation its own row\./);
  assert.doesNotMatch(viaFindings, /Unrelated note/);
  const observed = redAxes([{ authority: { receipt: { finalMessage: JSON.stringify({
    designQuality: { axes: [{ axis: 'responsiveCraft', verdict: 'RED', criticalFailure: null }] },
    findings: [{ axes: ['responsiveCraft'], observedCondition: 'At 390px the hero example is cropped.', repairCriterion: 'Show it whole.' }],
  }) } } }]);
  assert.match(observed, /responsiveCraft: At 390px the hero example is cropped\. Repair: Show it whole\./);
});
