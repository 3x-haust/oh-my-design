import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { CANDIDATE_SELECTION_POINTER_PATH, CANDIDATE_SELECTION_POINTER_SCHEMA } from '../core/brief/candidate-selection.ts';
import { contractSha256, deliveryReceipt, readDeliveryReceipts, requireStage, resolveRunState, stageDefinition } from '../core/stage/contract.ts';
import { stageArtifactProblems } from '../core/stage/output.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const pack = join(repo, 'core');
const candidateDirectory = '.omd/.cache/sketches/work-object';
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(repo, 'test/fixtures/adaptive-flow', `${name}.json`), 'utf8'));
const hash = (body: string): string => createHash('sha256').update(body).digest('hex');

function project(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-stage-candidate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function selectedCandidate(root: string): void {
  mkdirSync(join(root, candidateDirectory), { recursive: true });
  const index = '<main><h1>Confirmation</h1><p>Local structural fixture.</p></main>';
  const selection = JSON.stringify({ candidateId: 'work-object', basis: 'Structural fixture; no independent review claim.' });
  writeFileSync(join(root, candidateDirectory, 'index.html'), index);
  writeFileSync(join(root, candidateDirectory, 'selection.json'), selection);
  writeFileSync(join(root, candidateDirectory, 'noun-swap-test.json'), JSON.stringify({ fixture: 'confirmation work object' }));
  writeFileSync(join(root, candidateDirectory, 'ux-models.json'), JSON.stringify({ fixture: 'inspect confirmation' }));
  writeFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH), JSON.stringify({
    schema: CANDIDATE_SELECTION_POINTER_SCHEMA,
    directory: 'work-object',
    indexSha256: hash(index),
    selectionSha256: hash(selection),
  }));
}

test('selected candidate generation remains in route state with its Sketch-owned current pointer', t => {
  const root = project(t);
  const invocation = publishTestAdaptiveRoute(root, fixture('medical-new-product'));
  const state = resolveRunState(root, pack, invocation);
  const candidate = state.stages.find(stage => String(stage.stage) === 'candidate-generation');
  assert.ok(candidate, 'the selected candidate producer must not disappear after composition');
  assert.equal(candidate.owner, 'omd-sketch');
  assert.equal(candidate.artifact, CANDIDATE_SELECTION_POINTER_PATH);
  assert.equal(candidate.present, false);
  const order = state.stages.map(stage => String(stage.stage));
  assert.ok(order.indexOf('candidate-generation') > order.indexOf('composition'));
});

test('explicit candidate skip preserves a copy-only route without candidate output', t => {
  const root = project(t);
  const invocation = publishTestAdaptiveRoute(root, fixture('copy-only'));
  assert.equal(resolveRunState(root, pack, invocation).stages.some(stage => String(stage.stage) === 'candidate-generation'), false);
});

test('candidate stage contract delivery remains available without an adaptive route', t => {
  const root = project(t);
  mkdirSync(join(root, '.omd'), { recursive: true });
  const stage = stageDefinition('candidate-generation');
  assert.ok(stage.requiredContracts.length > 0);
  const before = requireStage(root, pack, stage.id);
  assert.deepEqual(before.undeliveredContracts, stage.requiredContracts);
  const receipts = stage.requiredContracts.map(contract => deliveryReceipt(stage.id, contract, contractSha256(pack, contract), '2026-09-21T00:00:00Z'));
  writeFileSync(join(root, '.omd/delivery.jsonl'), receipts.map(receipt => JSON.stringify(receipt)).join('\n') + '\n');
  assert.deepEqual(readDeliveryReceipts(root), receipts);
  assert.deepEqual(requireStage(root, pack, stage.id).undeliveredContracts, []);
  assert.ok(requireStage(root, pack, stage.id).missingArtifacts.includes('.omd/composition.md'));
});

test('candidate output rejects an absent current pointer even if a legacy selected folder exists', t => {
  const root = project(t);
  mkdirSync(join(root, '.omd/.cache/sketches/legacy-selected'), { recursive: true });
  writeFileSync(join(root, '.omd/.cache/sketches/legacy-selected/index.html'), '<main>Legacy</main>');
  const problems = stageArtifactProblems(root, stageDefinition('candidate-generation').id);
  assert.ok(problems.some(problem => problem.includes(CANDIDATE_SELECTION_POINTER_PATH)));
});

test('candidate output rejects a malformed pointer despite a nonempty JSON file', t => {
  const root = project(t);
  selectedCandidate(root);
  writeFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH), '{}');
  assert.deepEqual(stageArtifactProblems(root, stageDefinition('candidate-generation').id), ['CANDIDATE_SELECTION_POINTER_INVALID']);
});

test('candidate output accepts complete current selected evidence without claiming visual approval', t => {
  const root = project(t);
  selectedCandidate(root);
  assert.deepEqual(stageArtifactProblems(root, stageDefinition('candidate-generation').id), []);
});

test('public candidate selection schema authors the current pointer accepted by output validation', t => {
  const root = project(t);
  selectedCandidate(root);
  const current = JSON.parse(readFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH), 'utf8'));
  const schema = inputSkeleton('candidate-selection');
  assert.deepEqual([...schema.keys].sort(), Object.keys(current).sort());
  writeFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH), JSON.stringify({ ...schema.skeleton as object, ...current }));
  assert.deepEqual(stageArtifactProblems(root, stageDefinition('candidate-generation').id), []);
});

for (const filename of ['index.html', 'selection.json']) {
  test(`candidate output rejects changed selected ${filename} bytes`, t => {
    const root = project(t);
    selectedCandidate(root);
    writeFileSync(join(root, candidateDirectory, filename), 'Changed after the selection pointer was published.');
    assert.deepEqual(stageArtifactProblems(root, stageDefinition('candidate-generation').id), ['CANDIDATE_SELECTION_STALE']);
  });
}

test('candidate output rejects missing evidence required by the current selection', t => {
  const root = project(t);
  selectedCandidate(root);
  unlinkSync(join(root, candidateDirectory, 'ux-models.json'));
  assert.ok(stageArtifactProblems(root, stageDefinition('candidate-generation').id).some(problem => problem.includes('ux-models.json')));
});

test('candidate output rejects an empty selected evidence file', t => {
  const root = project(t);
  selectedCandidate(root);
  writeFileSync(join(root, candidateDirectory, 'noun-swap-test.json'), ' \n');
  assert.ok(stageArtifactProblems(root, stageDefinition('candidate-generation').id).some(problem => problem.includes('noun-swap-test.json') && problem.includes('empty')));
});
