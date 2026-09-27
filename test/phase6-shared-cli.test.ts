import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { publishCandidatePacket, publishCandidateSelection } from '../core/brief/candidate-choice.ts';
import { fileReceipt, jsonBytes } from '../core/brief/candidate-data.ts';
import { loadRoleProfile } from '../core/brief/profiles.ts';
import { parseSelectedArtDirectionInput, readSelectedArtDirection } from '../core/art-direction/selected.ts';
import { PiRequestBindings } from '../extensions/omd-request-binding.ts';
import { readPiReviewPurpose } from '../extensions/omd-review-purpose.ts';
import { fixture, renderedSet, userChoice, write, snapshot } from './helpers/phase6-process.ts';

// Exercise the shipped executable launcher, not an imported command or a mocked dispatcher.
const CLI = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const run = (root: string, args: string[]) => spawnSync(process.execPath, [CLI, ...args], {
  cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
});
// A guarded publisher consumes its command nonce even on refusal. No authored/source/evidence
// bytes may change; nonce consumption is the expected anti-replay bookkeeping, not publication.
const artifacts = (root: string) => snapshot(root).filter(([path]) => !path!.startsWith(join(root, '.omd/activation/consumed-nonces')));
function json(root: string, args: string[]) {
  const result = run(root, [...args, '--json']);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

test('CLI current route starters carry ordinary/null and v3 art starter has the exact closed shape', t => {
  const f = fixture(t);
  for (const name of ['route-input', 'product-route-input', 'design-route-input']) {
    const entry = json(f.root, ['schema', name]);
    assert.equal(entry.skeleton.reviewPurpose, 'ordinary');
    assert.equal(entry.skeleton.reviewPurposeAuthority, null);
    assert.ok(entry.keys.includes('reviewPurpose') && entry.keys.includes('reviewPurposeAuthority'));
    assert.equal(entry.skeleton.processPolicy.interactionMode, 'interactive');
  }
  const entry = json(f.root, ['schema', 'art-direction-input-v3']);
  assert.deepEqual(Object.keys(entry.skeleton).sort(), [...entry.keys].sort());
  const parsed = parseSelectedArtDirectionInput({ ...entry.skeleton,
    candidateSelection: { path: '.omd/.cache/sketches/selections/choice.json', sha256: 'a'.repeat(64) },
    selectedId: 'B', register: 'content-led',
  });
  assert.deepEqual(parsed.motion, { decision: 'none', settlement: null, evaluatorAssessment: null, evaluatorResult: null });
  assert.deepEqual(parsed.metaphorQualities, []);
  assert.deepEqual(parsed.literalPropsToReject, []);
  assert.deepEqual(parsed.beatIds, []);
});

test('CLI role briefs keep Eye isolated and Sketch bound to its exact committed task', t => {
  const f = fixture(t), plan = publishCandidatePlan(f.root, f.plan, f.writer, f.invocation);
  const sketch = { schema: 'sketch-brief-v1', mode: 'visual-study', plan, candidateId: 'A', sourceDirectory: '.omd/.cache/sketches/A' };
  write(f.root, '.omd/.cache/sketch-brief.json', jsonBytes(sketch));
  const before = snapshot(f.root);
  const eye = json(f.root, ['brief', 'candidate-generation', '--role', 'omd-eye', '--mode', 'concept-selection']);
  assert.equal(eye.schema, 'role-brief-v1');
  assert.equal(eye.delivery, 'isolated-host-packet-required');
  assert.equal(eye.profile.sha256, loadRoleProfile('omd-eye', 'concept-selection').sha256);
  assert.deepEqual(eye.inputs, []); assert.deepEqual(eye.images, []); assert.deepEqual(eye.owns, []);
  for (const key of ['request', 'references', 'candidate', 'scope', 'selectedDirection', 'system', 'contracts']) assert.equal(Object.hasOwn(eye, key), false);
  const result = json(f.root, ['brief', 'candidate-generation', '--role', 'omd-sketch', '--mode', 'visual-study', '--input', '.omd/.cache/sketch-brief.json']);
  assert.deepEqual(result.sketch, sketch);
  assert.equal(result.candidate.id, 'A');
  assert.deepEqual(result.owns, [sketch.sourceDirectory]);
  assert.deepEqual(result.candidateInputs.content.receipt, f.plan.content.receipt);
  for (const args of [
    ['--role', 'omd-eye'], ['--role', 'omd-eye', '--mode', 'unknown'],
    ['--role', 'omd-eye', '--mode', 'concept-selection', '--check'],
    ['--mode', 'visual-study'], ['--role', 'omd-sketch', '--mode', 'visual-study'],
    ['--role', 'omd-sketch', '--mode', 'structural', '--input', '.omd/.cache/sketch-brief.json'],
    ['--role', 'omd-writer', '--input', '.omd/.cache/sketch-brief.json'],
  ]) {
    const rejected = run(f.root, ['brief', 'candidate-generation', ...args, '--json']);
    assert.equal(rejected.status, 1, rejected.stdout);
    assert.match(rejected.stderr, /ROLE_BRIEF|ROLE_PROFILE/);
  }
  assert.deepEqual(snapshot(f.root), before);
});

test('CLI verifies native Sketch handbacks and publishes selected static art without legacy reference inputs', async t => {
  const f = fixture(t), set = await renderedSet(f), candidate = set.candidates[0]!;
  const sketch = { schema: 'sketch-brief-v1', mode: 'visual-study', plan: set.plan, candidateId: candidate.id,
    sourceDirectory: `.omd/.cache/sketches/${candidate.id}` };
  const study = { schema: 'visual-study-v1', plan: set.plan, content: f.plan.content.receipt, tokens: f.plan.tokens,
    candidateId: candidate.id, views: candidate.previews, testedRelationship: f.plan.candidates[0]!.relationship,
    findings: [{ kind: 'responsive', status: 'unassessed', evidence: [], observation: 'Native previews retained for independent inspection.' }],
    limitations: ['No independent quality verdict.'] };
  write(f.root, '.omd/.cache/sketch-brief.json', jsonBytes(sketch));
  write(f.root, '.omd/.cache/study.json', jsonBytes(study));
  const args = ['candidate', 'study-check', '--input', '.omd/.cache/study.json', '--brief', '.omd/.cache/sketch-brief.json'];
  const before = snapshot(f.root);
  assert.deepEqual(json(f.root, args), { ok: true, study });
  assert.deepEqual(snapshot(f.root), before);
  for (const invalid of [{ ...study, schema: 'structural-study-v1' }, { ...study, beauty: 3 }, { ...study, views: study.views.slice(1) }]) {
    write(f.root, '.omd/.cache/study.json', jsonBytes(invalid));
    const unchanged = snapshot(f.root), rejected = run(f.root, [...args, '--json']);
    assert.equal(rejected.status, 1, rejected.stdout);
    assert.deepEqual(snapshot(f.root), unchanged);
  }
  write(f.root, '.omd/.cache/study.json', jsonBytes(study));
  const packet = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  // Test host boundary fixture, not a production CLI signer or an authored approval flag.
  publishCandidateSelection(f.root, userChoice(f, packet), f.writer, f.invocation);
  assert.equal(existsSync(join(f.root, '.omd/reference-selection-v2.json')), false);
  const pointer = JSON.parse(readFileSync(join(f.root, '.omd/.cache/sketches/current.json'), 'utf8'));
  const input = json(f.root, ['art-direction', 'check-input']);
  assert.equal(input.schema, 'art-direction-input-v3');
  assert.deepEqual(input.candidateSelection, pointer.selection);
  assert.equal(input.selectedId, 'B');
  assert.equal(input.relationship, f.plan.candidates[1]!.relationship);
  assert.equal(input.staticContract.hierarchy, f.plan.candidates[1]!.layoutStrategy);
  assert.equal(Object.hasOwn(input, 'alternatives'), false);
  assert.equal(run(f.root, ['art-direction', 'check-input', '--route', '/', '--json']).status, 1);
  const authored = { ...input, register: 'content-led', implementationLane: 'Static HTML and CSS',
    fallbackPath: 'Semantic document without animation', performanceAccessibilityBudget: 'No external fonts or temporal scene' };
  const artArgs = ['art-direction', 'check', '--input', '.omd/.cache/art.json', '--json'];
  for (const invalid of [
    { ...authored, selectedId: 'A' }, { ...authored, relationship: 'An unchosen relationship' },
    { ...authored, motion: { ...authored.motion, decision: 'one' } },
    { ...authored, evaluatorAssessment: { suitability: 'pass' } },
  ]) {
    write(f.root, '.omd/.cache/art.json', jsonBytes(invalid));
    const unchanged = artifacts(f.root), rejected = run(f.root, artArgs);
    assert.equal(rejected.status, 1, rejected.stdout);
    assert.deepEqual(artifacts(f.root), unchanged);
  }
  write(f.root, '.omd/.cache/art.json', jsonBytes(authored));
  const published = run(f.root, artArgs);
  assert.equal(published.status, 0, published.stderr);
  const art = JSON.parse(published.stdout);
  assert.equal(art.schemaVersion, 'art-direction-current-v3');
  assert.deepEqual(art.record, fileReceipt(f.root, art.record.path));
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, '.omd/art-direction.json'), 'utf8')), art);
  const current = readSelectedArtDirection(f.root, f.route.sourceContractSha256);
  assert.equal(current.decision.selectedId, 'B');
  assert.equal(current.decision.decidedBy, 'user');
  assert.deepEqual(current.decision.beatIds, []);
  const writer = json(f.root, ['brief', 'copy', '--role', 'omd-writer']);
  assert.equal(writer.artDirection.schema, 'selected-art-copy-v1');
  assert.equal(Object.hasOwn(writer.artDirection, 'metaphorQualities'), false);
  write(f.root, candidate.source.path, readFileSync(join(f.root, candidate.source.path), 'utf8') + '\n');
  const stale = snapshot(f.root);
  assert.equal(run(f.root, [...args, '--json']).status, 1);
  assert.equal(run(f.root, ['art-direction', 'check-input', '--json']).status, 1);
  assert.deepEqual(snapshot(f.root), stale);
});

test('CLI rejects unauthenticated ordinary starters and accepts the exact real Pi origin transport', t => {
  const f = fixture(t), path = '.omd/.cache/route-input.json';
  write(f.root, path, jsonBytes({ ...f.input, reviewPurpose: 'ordinary', reviewPurposeAuthority: null }));
  const before = snapshot(f.root), args = ['route', 'classify', '--input', path, '--json'];
  const refused = run(f.root, args);
  assert.equal(refused.status, 1); assert.match(refused.stderr, /ROUTE_AUTHORITY_REQUIRED/);
  assert.deepEqual(snapshot(f.root), before);
  const bindings = new PiRequestBindings(), prompt = `/skill:omd-ultradesign ${f.input.request}`;
  bindings.receive(f.root, { source: 'interactive', text: prompt });
  bindings.activate(f.root, prompt);
  assert.equal(bindings.classificationGranted(f.root), true);
  const origin = readPiReviewPurpose(f.root, f.input.request);
  write(f.root, path, jsonBytes({ ...f.input, ...origin }));
  const accepted = run(f.root, args);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(JSON.parse(accepted.stdout).sourceContract.reviewPurposeAuthority, origin.reviewPurposeAuthority);
  write(f.root, origin.reviewPurposeAuthority.path, readFileSync(join(f.root, origin.reviewPurposeAuthority.path), 'utf8') + '\n');
  const tampered = artifacts(f.root);
  const rejected = run(f.root, args);
  assert.equal(rejected.status, 1); assert.match(rejected.stderr, /ROUTE_AUTHORITY_REQUIRED/);
  assert.deepEqual(artifacts(f.root), tampered);
});
