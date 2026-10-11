import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidateStudy, parseSketchBrief } from '../core/brief/candidate-study.ts';
import { readBuildAgents } from '../adapters/build-identity.ts';
import { promptRoot, assertRoleDelivery } from './helpers/prompt-delivery.ts';

const receipt = { path: '.omd/study.json', sha256: 'a'.repeat(64) };
const study = { schema: 'structural-study-v1', plan: receipt, content: receipt, tokens: receipt, candidateId: 'A', views: [], testedRelationship: 'Cause before consequence', findings: [], limitations: ['No live interaction observation.'] };

test('structural studies cannot carry motion or final beauty, while visual-study is explicitly selected', () => {
  for (const extra of [{ motion: 'one' }, { beauty: 4 }, { animation: {} }]) assert.throws(() => parseCandidateStudy({ ...study, ...extra }));
  assert.equal(parseCandidateStudy(study).schema, 'structural-study-v1');
  assert.equal(parseSketchBrief({ schema: 'sketch-brief-v1', mode: 'visual-study', plan: receipt, candidateId: 'A', sourceDirectory: '.omd/.cache/sketches/A' }).mode, 'visual-study');
  assert.throws(() => parseSketchBrief({ schema: 'sketch-brief-v1', mode: 'showpiece', plan: receipt, candidateId: 'A', sourceDirectory: '.omd/.cache/sketches/A' }));
});

test('paired host-only candidate motion sentinels remain available without creating another agent', () => {
  const agents = readBuildAgents(promptRoot), sketch = agents.find(a => a.name === 'omd-sketch')!;
  assert.ok(sketch.instructions.includes('[host-evidence-only:candidate]'));
  assert.ok(sketch.instructions.includes('[candidate-motion-scene:v1]'));
  assertRoleDelivery('sketch'); assertRoleDelivery('composer');
});
