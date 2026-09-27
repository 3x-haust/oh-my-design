import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRoleBrief, checkRoleHandback, roleSystemProjection } from '../core/brief/role.ts';
import { initializeDesignInventory } from '../core/tokens/inventory.ts';
import { publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { publishCandidatePacket, publishCandidateSelection } from '../core/brief/candidate-choice.ts';
import { publishSelectedArtDirection, readSelectedArtDirection, selectedArtDirectionInput, selectedArtCopyProjection } from '../core/art-direction/selected.ts';
import { fileReceipt } from '../core/brief/candidate-data.ts';
import { fixture, renderedSet, userChoice, write, snapshot, pack } from './helpers/phase6-process.ts';

test('Typesetter and concept makers get actual current system bytes, unverified variants and honest gaps', t => {
  const f = fixture(t); write(f.root, 'style.css', ':root { --ink: #111111; }'); write(f.root, 'Card.tsx', 'export const Card = () => null;');
  initializeDesignInventory(f.root, f.writer);
  const result = roleSystemProjection(f.root);
  assert.equal(result.status.status, 'current');
  assert.equal(result.document!.content, readFileSync(join(f.root, '.omd/existing-design-system.md'), 'utf8'));
  assert.deepEqual(result.document!.receipt, fileReceipt(f.root, '.omd/existing-design-system.md'));
  assert.equal(result.components[0]!.variantCoverage, 'unverified');
  const role = buildRoleBrief(f.root, 'type-proof', { role: 'omd-typesetter' }, pack, f.invocation);
  assert.ok('system' in role && role.system?.document);
  assert.ok('gaps' in role && role.gaps.length > 0);
  write(f.root, 'style.css', ':root { --ink: #222222; }');
  assert.equal(roleSystemProjection(f.root).inventory, null);
  assert.equal(roleSystemProjection(f.root).status.status, 'stale');
});

test('Sketch receives only its committed hypothesis and exact mode, not sibling sources or scores', t => {
  const f = fixture(t), plan = publishCandidatePlan(f.root, f.plan, f.writer, f.invocation);
  const sketch = { schema: 'sketch-brief-v1' as const, mode: 'visual-study' as const, plan, candidateId: 'A', sourceDirectory: '.omd/.cache/sketches/A' };
  const result = buildRoleBrief(f.root, 'candidate-generation', { role: 'omd-sketch', mode: 'visual-study', sketch }, pack, f.invocation);
  assert.ok('candidate' in result && result.candidate?.id === 'A');
  assert.deepEqual(result.owns, ['.omd/.cache/sketches/A']);
  assert.throws(() => buildRoleBrief(f.root, 'candidate-generation', { role: 'omd-sketch', mode: 'structural', sketch }, pack, f.invocation));
  assert.throws(() => checkRoleHandback(f.root, { role: 'omd-sketch', mode: 'visual-study', sketch }, { schema: 'structural-study-v1' }, f.invocation));
});

test('chosen art settlement consumes real authenticated rendered choice without a second register tournament', async t => {
  const f = fixture(t), set = await renderedSet(f), packet = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  publishCandidateSelection(f.root, userChoice(f, packet), f.writer, f.invocation);
  const selected = selectedArtDirectionInput(f.root);
  const input = { schema: 'art-direction-input-v3', candidateSelection: selected.candidateSelection, selectedId: selected.selectedId,
    register: 'content-led', relationship: selected.hypothesis.relationship,
    staticContract: { hierarchy: 'Cause and effect remain adjacent.', density: 'All shared units remain visible.', typography: 'Preserve the readable neutral body.', preserve: ['Compare cause and effect'], falsifiers: ['Relationship is lost.'] },
    metaphorQualities: [], literalPropsToReject: [], motion: { decision: 'none', settlement: null, evaluatorAssessment: null, evaluatorResult: null },
    implementationLane: 'static HTML/CSS', fallbackPath: 'semantic static content', performanceAccessibilityBudget: 'No external fonts or temporal scene.', beatIds: [] };
  const before = snapshot(f.root);
  assert.throws(() => publishSelectedArtDirection(f.root, { ...input, selectedId: 'A' }, f.writer, f.invocation));
  assert.deepEqual(snapshot(f.root), before);
  assert.equal(publishSelectedArtDirection(f.root, input, f.writer, f.invocation).schemaVersion, 'art-direction-current-v3');
  const current = readSelectedArtDirection(f.root, f.route.sourceContractSha256);
  assert.equal(current.decision.selectedId, 'B'); assert.equal(current.decision.decidedBy, 'user');
  assert.equal(current.decision.register, 'content-led'); assert.deepEqual(current.decision.metaphorQualities, []);
  assert.equal('metaphorQualities' in selectedArtCopyProjection(current), false);
  const old = readFileSync(join(f.root, '.omd/art-direction.json'));
  write(f.root, '.omd/tokens.json', readFileSync(join(f.root, '.omd/tokens.json'), 'utf8') + '\n');
  assert.throws(() => readSelectedArtDirection(f.root, f.route.sourceContractSha256));
  assert.deepEqual(readFileSync(join(f.root, '.omd/art-direction.json')), old);
});
