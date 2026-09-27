import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { publishCandidatePlan, checkCandidateSet } from '../core/brief/candidate-plan.ts';
import { publishCandidatePacket } from '../core/brief/candidate-choice.ts';
import { fixture, renderedSet, snapshot, write, userChoice, repo } from './helpers/phase6-process.ts';
import { isMutatingOmdCommand, classifyPiWrite } from '../extensions/omd-guard.ts';
import { checkCandidateStudy } from '../core/brief/candidate-study.ts';

test('representative plan is committed before sources; wrong counts, aliases and override types refuse without mutation', t => {
  const f = fixture(t);
  for (const change of [
    (p: typeof f.plan) => ({ ...p, candidateCount: 3 }),
    (p: typeof f.plan) => ({ ...p, candidates: [p.candidates[0], { ...p.candidates[1], layoutStrategy: p.candidates[0]!.layoutStrategy, relationship: p.candidates[0]!.relationship }] }),
    (p: typeof f.plan) => ({ ...p, candidates: [{ ...p.candidates[0], primitiveOverrides: { size: { type: 'color', value: '#fff' } } }, p.candidates[1]] }),
    (p: typeof f.plan) => ({ ...p, views: p.views.slice(0, 1) }),
  ]) {
    const before = snapshot(f.root);
    assert.throws(() => publishCandidatePlan(f.root, change(f.plan), f.writer, f.invocation));
    assert.deepEqual(snapshot(f.root), before);
    assert.ok(publishCandidatePlan(f.root, f.plan, f.writer, f.invocation).sha256);
  }
});

test('native observations reject color-only variants even when authored structural hypotheses differ', async t => {
  const f = fixture(t), colorOnly = await renderedSet(f, true), before = snapshot(f.root);
  assert.throws(() => publishCandidatePacket(f.root, colorOnly, f.writer, f.invocation), /identical observed structure/);
  assert.deepEqual(snapshot(f.root), before);
  const distinct = await renderedSet(f);
  assert.ok(publishCandidatePacket(f.root, distinct, f.writer, f.invocation).candidateSet.sha256);
});

test('actual native previews bind exactly one shared surface/state/content/view set, not legacy marketing UX files', async t => {
  const f = fixture(t), set = await renderedSet(f);
  for (const change of [
    () => ({ ...set, candidates: set.candidates.slice(0, 1) }),
    () => ({ ...set, candidates: [{ ...set.candidates[0], effectiveTokensSha256: '0'.repeat(64) }, set.candidates[1]] }),
    () => ({ ...set, candidates: [{ ...set.candidates[0], previews: set.candidates[0]!.previews.slice(0, 1) }, set.candidates[1]] }),
    () => ({ ...set, candidates: [{ ...set.candidates[0], previews: set.candidates[0]!.previews.map(p => ({ ...p, stateId: 'other' })) }, set.candidates[1]] }),
    () => ({ ...set, candidates: [{ ...set.candidates[0], source: set.candidates[1]!.source }, set.candidates[1]] }),
  ]) {
    const before = snapshot(f.root);
    assert.throws(() => publishCandidatePacket(f.root, change(), f.writer, f.invocation));
    assert.deepEqual(snapshot(f.root), before);
    assert.ok(publishCandidatePacket(f.root, set, f.writer, f.invocation).candidateSet.sha256);
  }
  const path = join(f.root, set.candidates[0]!.previews[0]!.png.path), bytes = readFileSync(path);
  writeFileSync(path, Buffer.from('not a PNG'));
  const before = snapshot(f.root);
  assert.throws(() => publishCandidatePacket(f.root, set, f.writer, f.invocation), /stale receipt/);
  assert.deepEqual(snapshot(f.root), before);
  writeFileSync(path, bytes);
  assert.equal(checkCandidateSet(f.root, set, f.route.sourceContractSha256).set.candidates.length, 2);
  assert.equal(publishCandidatePacket(f.root, set, f.writer, f.invocation).pending?.optionIds.length, 2);
  const brief = { schema: 'sketch-brief-v1', mode: 'structural', plan: set.plan, candidateId: 'A', sourceDirectory: '.omd/.cache/sketches/A' };
  const study = { schema: 'structural-study-v1', plan: set.plan, content: f.plan.content.receipt, tokens: f.plan.tokens, candidateId: 'A', views: set.candidates[0]!.previews,
    testedRelationship: 'Cause before effect', findings: [{ kind: 'task', status: 'unassessed', evidence: [], observation: 'Static pixels do not prove a live task.' }], limitations: ['No keyboard task execution.'] };
  for (const invalid of [{ ...study, beauty: 4 }, { ...study, motion: 'one' }, { ...study, schema: 'visual-study-v1' }]) {
    const before = snapshot(f.root);
    assert.throws(() => checkCandidateStudy(f.root, brief, invalid, f.route.sourceContractSha256));
    assert.deepEqual(snapshot(f.root), before);
    assert.equal(checkCandidateStudy(f.root, brief, study, f.route.sourceContractSha256).schema, 'structural-study-v1');
  }
  assert.equal(checkCandidateStudy(f.root, { ...brief, mode: 'visual-study' }, { ...study, schema: 'visual-study-v1' }, f.route.sourceContractSha256).schema, 'visual-study-v1');
});

test('new schemas and commands execute through the real CLI; publishers and owned paths have explicit permissions', { timeout: 120_000 }, async t => {
  const f = fixture(t);
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [join(repo, 'bin/omd.ts'), ...args], { cwd: f.root, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout;
  };
  for (const name of ['candidate-plan', 'candidate-content', 'candidate-set', 'candidate-selection-v2', 'minimal-tokens', 'token-extensions', 'frame']) assert.ok(JSON.parse(cli('schema', name, '--json')));
  cli('candidate', 'help');
  write(f.root, '.omd/.cache/plan-input.json', JSON.stringify(f.plan));
  const planned = JSON.parse(cli('candidate', 'plan', '--input', '.omd/.cache/plan-input.json', '--json'));
  assert.equal(planned.candidateTokens.length, 2);
  const content = JSON.parse(cli('candidate', 'content', '--input', '.omd/.cache/sketches/content.json', '--json'));
  assert.equal(content.projectionSha256, f.plan.content.projectionSha256);
  cli('tokens', 'check', '--input', '.omd/tokens.json', '--json');
  const set = await renderedSet(f); write(f.root, '.omd/.cache/set-input.json', JSON.stringify(set));
  assert.equal(JSON.parse(cli('candidate', 'check', '--input', '.omd/.cache/set-input.json', '--json')).ok, true);
  const packet = JSON.parse(cli('candidate', 'packet', '--input', '.omd/.cache/set-input.json', '--json'));
  write(f.root, '.omd/.cache/choice-input.json', JSON.stringify(userChoice(f, packet)));
  cli('candidate', 'select', '--input', '.omd/.cache/choice-input.json', '--json');
  assert.equal(JSON.parse(cli('candidate', 'check', '--current', '--json')).selectionStatus, 'current');
  write(f.root, '.omd/.cache/extensions-input.json', JSON.stringify({ schema: 'token-extensions-v1', primitives: { error: { type: 'color', value: '#b00000' } }, semantic: {}, textStyles: {}, neededBy: [{ tokenId: 'primitives.error', surfaceId: 'details', stateId: 'initial', componentId: 'details' }] }));
  cli('tokens', 'extend', '--input', '.omd/.cache/extensions-input.json', '--json');
  assert.equal(JSON.parse(cli('tokens', 'check', '--json')).selectionStatus, 'current');
  assert.equal(JSON.parse(cli('config', 'show')).directionPolicy, 'interactive');
  for (const command of [['candidate', 'plan'], ['candidate', 'packet'], ['candidate', 'select'], ['tokens', 'extend']]) assert.equal(isMutatingOmdCommand(command), true);
  const before = snapshot(f.root);
  assert.equal(classifyPiWrite(f.root, '.omd/.cache/sketches/current.json').kind, 'blocked');
  assert.deepEqual(snapshot(f.root), before);
  assert.equal(classifyPiWrite(f.root, '.omd/.cache/sketches/A/index.html').kind, 'authoring');
});
