import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMeasuredHandbackShape } from '../adapters/measured-reviewer-publication.ts';

const packet = Buffer.from(JSON.stringify({ outputContract: {
  reviewerFields: ['schema', 'verdicts', 'criticalFloors', 'findings'],
  verdictKeys: ['blindVisual', 'realityFit'], criticalFloorKeys: ['composition', 'copy'],
} }));
const handback = (verdicts: unknown, criticalFloors: unknown) => JSON.stringify({ schema: 'x', verdicts, criticalFloors, findings: [] });

test('measured handback shape accepts GREEN and RED judgments alike', () => {
  checkMeasuredHandbackShape(handback({ blindVisual: 'GREEN', realityFit: 'RED' }, { composition: 4, copy: 2 }), packet);
});

test('measured handback shape names the field when a reviewer writes PASS or a score object', () => {
  assert.throws(() => checkMeasuredHandbackShape(handback({ blindVisual: 'PASS', realityFit: 'GREEN' }, { composition: 4, copy: 4 }), packet),
    /verdicts\.blindVisual must be the string GREEN or RED, not "PASS"/);
  assert.throws(() => checkMeasuredHandbackShape(handback({ blindVisual: 'GREEN', realityFit: 'GREEN' }, { composition: { score: 4, met: true }, copy: 4 }), packet),
    /criticalFloors\.composition must be one integer score from 0 to 4/);
  assert.throws(() => checkMeasuredHandbackShape('{"schema":"x"}', packet), /missing: verdicts, criticalFloors, findings/);
});

test('measured blind handback shape refuses an axis object but leaves a below-floor GREEN to publication', () => {
  const blind = Buffer.from(JSON.stringify({ outputContract: {
    reviewerFields: ['schema', 'verdicts', 'criticalFloors', 'designQuality', 'findings'],
    verdictKeys: ['blindVisual'], criticalFloorKeys: ['composition'],
  } }));
  const evidence = [{ observationSha256: 'a'.repeat(64), captureSha256: 'b'.repeat(64), viewId: 'desktop-1280x900@1', state: 'initial',
    regionSubjectIds: [], packetSha256: 'c'.repeat(64), measurementIds: [`vm1:${'d'.repeat(64)}`], visibleCondition: 'x', userConsequence: 'y' }];
  const axes = ['typography', 'spacingRhythm', 'contrastColorRoles', 'density', 'hierarchy', 'composition', 'beautyDesirability', 'domainSpecificity', 'humanAuthorship', 'usability', 'responsiveCraft']
    .map(axis => ({ axis, verdict: 'GREEN', score: 2, crossViewport: 'preserved', criticalFailure: null, evidence }));
  const body = (designQuality: unknown) => JSON.stringify({ schema: 'x', verdicts: { blindVisual: 'GREEN' }, criticalFloors: { composition: 4 }, designQuality, findings: [] });
  checkMeasuredHandbackShape(body({ schema: 'design-quality-contract-v2', axes }), blind);
  assert.throws(() => checkMeasuredHandbackShape(body({ schema: 'design-quality-contract-v2', axes: { typography: { score: 4 } } }), blind), /designQuality: .*axisRow/);
});
