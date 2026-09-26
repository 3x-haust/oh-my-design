import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { checkBriefEntry } from '../core/brief/entry.ts';
import { allocateBriefReferences, buildBrief, formatBrief } from '../core/brief/index.ts';
import { CONFIDENCE_DEBT_PATH, readConfidenceDebt } from '../core/brief/confidence-debt.ts';
import { MINIMAL_COMPOSITION_SECTIONS } from '../core/brief/minimal-composition.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { STAGES, contractSha256, deliveryReceipt, resolveRunState } from '../core/stage/contract.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { MAX_EVIDENCE_REPLANS, EVIDENCE_BUDGET_PATH } from '../core/stage/evidence-budget.ts';
import { completionLimitations } from '../core/completion/limitations.ts';
import { slopRulesSha256 } from '../core/slop/review.ts';
import { withBrowser } from '../core/render/index.ts';
import { withLocalView } from '../core/render/stateful.ts';
import type { RawIr, Rule } from '../core/types.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const pack = join(repo, 'core');
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const write = (root: string, path: string, bytes: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
const snapshot = (root: string): unknown => readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => { const path = join(entry.parentPath, entry.name); return [path, sha(readFileSync(path))]; }).sort();
function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-phase1-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = JSON.parse(readFileSync(join(repo, 'test/fixtures/adaptive-flow/synth-marketing.json'), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, input);
  const route = readPersistedRoute(root, invocation);
  const evidence = [{ status: 'user-provided', reference: 'request' }];
  const statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: input.request }] });
  write(root, '.omd/domain-brief.json', JSON.stringify({ schema: 'domain-brief-v1', request: route.request,
    domain: 'Instrument launch', summary: 'Show the supplied patching task without inventing terms.',
    surfaces: [{ name: 'Launch', purpose: 'Understand patching and inspect details', evidence }], coreObjects: [{ name: 'Patch', evidence }],
    audience: { description: 'Instrument players', evidence }, referenceQueries: { component: ['patch panel'], craft: ['readable type'], mood: ['instrument workspace'] },
    planning: { businessGoal: statement('Explain patching'), successSignal: statement('Reach details without commitment'), nonGoals: [statement('No invented commercial terms')] } }));
  write(root, '.omd/frame.md', `---\n${stringify({ uxSurface: 'marketing', uxTask: 'Understand patching', uxFrequentAction: 'Inspect preorder details', uxCostliestError: 'Mistake unknown terms for facts',
    reality: { schema: 'reality-ledger-v1', mode: 'greenfield', facts: [{ category: 'subject', status: 'supplied', statement: 'Compact patchable synthesizer', source: 'request' }] } })}---\n# Launch frame\n`);
  write(root, '.omd/composition.md', `## Input fingerprint\n- Frame SHA-256: ${sha(readFileSync(join(root, '.omd/frame.md')))}\n- Source contract SHA-256: ${route.sourceContractSha256}\n\n${MINIMAL_COMPOSITION_SECTIONS.map(section => `## ${section}\nKeep the patching explanation before the details action; reflow controls in task order without commercial claims.\n`).join('\n')}`);
  write(root, '.omd/delivery.jsonl', STAGES.filter(stage => route.strategy.stages.includes(stage.id)).flatMap(stage => stage.requiredContracts.map(contract =>
    JSON.stringify(deliveryReceipt(stage.id, contract, contractSha256(pack, contract, stage.id), '2026-09-26T00:00:00Z')))).join('\n') + '\n');
  return { root, invocation, route, writer: createTestProjectWriteAdapter(root, invocation) };
}

test('authorized full greenfield build with zero references enters production, records debt and renders without terminal authority', async t => {
  const f = fixture(t);
  assert.equal(existsSync(join(f.root, '.omd/refs')), false);
  const result = checkProductionReadiness(f.root, f.invocation, pack, 'index.html');
  assert.deepEqual(result.blockers, []);
  assert.ok(result.confidenceDebt.some(item => item.stage === 'reference-board'));
  assert.ok(result.confidenceDebt.some(item => item.stage === 'candidate-generation'));
  assert.ok(result.confidenceDebt.some(item => item.stage === 'composition'));
  assert.deepEqual(readConfidenceDebt(f.root, f.route.sourceContractSha256), result.confidenceDebt);
  assert.deepEqual(checkBriefEntry(f.root, 'production', pack, f.invocation).blockers, []);
  assert.ok(formatBrief(buildBrief(f.root, 'production', pack, f.invocation)).includes('limitations'));
  const cli = spawnSync(process.execPath, [join(repo, 'bin/omd.mjs'), 'guard', 'production', '--path', 'index.html', '--json'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.ok(JSON.parse(cli.stdout).confidenceDebt.length > 0);
  f.writer.write('index.html', '<!doctype html><html><head><title>Patch study</title></head><body><main><h1>Patch the instrument</h1><a href="#details">Inspect preorder details</a><section id="details">Commercial terms are not supplied.</section></main></body></html>');
  const png = await withBrowser(browser => withLocalView(browser, f.root,
    { page: 'index.html', viewport: { width: 390, height: 844 } }, async page => {
      assert.equal(await page.locator('h1').textContent(), 'Patch the instrument');
      return page.screenshot();
    }));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(existsSync(join(f.root, '.omd/final-evidence-v2.json')), false);
});

test('missing frame, scope and route authority refuse without mutation or debt publication', t => {
  for (const violation of ['frame', 'scope', 'route'] as const) {
    const f = fixture(t);
    if (violation === 'frame') unlinkSync(join(f.root, '.omd/frame.md'));
    if (violation === 'route') write(f.root, '.omd/route.json', '{}');
    const before = snapshot(f.root);
    const result = checkProductionReadiness(f.root, f.invocation, pack, violation === 'scope' ? 'unrequested.html' : 'index.html');
    assert.equal(result.ok, false, violation);
    assert.deepEqual(snapshot(f.root), before);
    assert.equal(existsSync(join(f.root, CONFIDENCE_DEBT_PATH)), false);
    assert.equal(existsSync(join(f.root, 'index.html')), false);
  }
});

test('minimal composition binds the current frame and cannot become an authority bypass', t => {
  const f = fixture(t);
  write(f.root, '.omd/frame.md', readFileSync(join(f.root, '.omd/frame.md'), 'utf8') + '\nChanged outcome detail.\n');
  const before = snapshot(f.root);
  const result = checkProductionReadiness(f.root, f.invocation, pack);
  assert.equal(result.ok, false);
  assert.match(result.blockers.join('\n'), /current Frame SHA-256/);
  assert.deepEqual(snapshot(f.root), before);
});

test('stage next advances past exhausted reference work with durable debt, never validated credit', t => {
  const f = fixture(t);
  write(f.root, '.omd/scout.md', '# Incomplete reference research\n');
  let work = nextStageWork(f.root, pack, f.invocation);
  assert.equal(work.stage, 'reference-board');
  for (let n = 1; n < MAX_EVIDENCE_REPLANS; n++) work = nextStageWork(f.root, pack, f.invocation);
  assert.notEqual(work.stage, 'reference-board');
  assert.ok(work.deferredStages.includes('reference-board'));
  assert.ok(work.confidenceDebt.some(item => item.stage === 'reference-board' && item.kind === 'budget-exhausted'));
  assert.ok(!work.progress.validatedStages.includes('reference-board'));
  assert.equal(existsSync(join(f.root, '.omd/reference-board.json')), false);
  assert.ok(existsSync(join(f.root, EVIDENCE_BUDGET_PATH)));
  // Every selected evidence owner has a finite opportunity; none can become an infinite loop.
  for (let n = 0; n < 12 && work.stage !== null; n++) work = nextStageWork(f.root, pack, f.invocation);
  assert.equal(work.stage, null);
  assert.deepEqual(checkBriefEntry(f.root, 'production', pack, f.invocation).blockers, []);
});

test('completion limitation projection never turns absent research into reference approval', t => {
  const f = fixture(t);
  assert.equal(checkProductionReadiness(f.root, f.invocation, pack).ok, true);
  const before = snapshot(f.root);
  const output = completionLimitations(f.root, f.route);
  assert.equal(output.application, null);
  assert.ok(output.limitations.some(item => item.stage === 'reference-board'));
  assert.ok(output.limitations.every(item => item.claim === 'not-verified'));
  assert.deepEqual(snapshot(f.root), before);
});

test('semantic delivery keeps unconsumed edits fresh and refuses consumed edits without mutation', t => {
  const f = fixture(t), packs = join(f.root, 'packs'), contract = 'protocol/human-design-loop.md';
  const original = '## Surface outcomes and execution requirements\nPreserve the task.\n## Blindness and isolation\nReview alone.\n';
  write(packs, contract, original);
  write(f.root, '.omd/delivery.jsonl', JSON.stringify(deliveryReceipt('frame', contract, contractSha256(packs, contract, 'frame'), '2026-09-26T00:00:00Z')) + '\n');
  const delivered = () => resolveRunState(f.root, packs, f.invocation).stages.find(stage => stage.stage === 'frame')!.delivered;
  assert.ok(delivered().includes(contract));
  write(packs, contract, original.replace('Review alone.', 'Use isolated reviewer contexts.'));
  assert.ok(delivered().includes(contract));
  write(packs, contract, original.replace('Preserve the task.', 'Preserve every requested task and recovery state.'));
  const before = snapshot(f.root);
  assert.ok(!delivered().includes(contract));
  assert.deepEqual(snapshot(f.root), before);
});

test('brief allocation reserves each surface before cross-cutting references, including pagination', () => {
  const refs = Array.from({ length: 30 }, (_, index) => ({ path: `ref-${index}`, component: `component-${index}`, slot: null,
    take: index === 0 ? Array.from({ length: 30 }, () => 'long principle') : ['short principle'] }));
  const result = allocateBriefReferences(refs, [{ surface: 'Home', paths: ['ref-0'] }, { surface: 'Settings', paths: ['ref-29'] }]);
  assert.ok(result.pages[0]!.some(ref => ref.path === 'ref-29'));
  assert.equal(result.omitted, 18);
  assert.ok(result.truncation);
  const overflow = allocateBriefReferences(refs, refs.map(ref => ({ surface: ref.component, paths: [ref.path] })));
  assert.equal(overflow.pages.length, 3);
  assert.equal(overflow.pages.flat().length, refs.length);
  assert.equal(overflow.omitted, 0);
  assert.ok(overflow.truncation);
});

test('slop freshness ignores unrelated rules but binds passing rules consumed by the scope', () => {
  const raw = JSON.parse(readFileSync(join(repo, 'test/fixtures/ir.raw.json'), 'utf8')) as RawIr;
  const rule: Rule = { id: 'scope-rule', layer: 1, category: 'slop', severity: 'warn', when: 'true', assert: 'true', message: 'scope-rule' };
  const unrelated: Rule = { ...rule, id: 'other-category', category: 'a11y' };
  const inactive: Rule = { ...rule, id: 'other-scope', when: 'false' };
  const before = slopRulesSha256([raw], [rule, unrelated, inactive]);
  assert.equal(slopRulesSha256([raw], [rule, { ...unrelated, assert: 'false' }, { ...inactive, assert: 'false' }]), before);
  assert.notEqual(slopRulesSha256([raw], [{ ...rule, assert: 'false' }, unrelated, inactive]), before);
  assert.notEqual(slopRulesSha256([raw], [rule, unrelated, { ...inactive, when: 'true' }]), before);
});
