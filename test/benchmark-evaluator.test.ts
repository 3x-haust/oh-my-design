import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluateBrowser, manifestAuthorizationHash, resolveSemanticLocator, validateBenchmarkManifest } from '../scripts/benchmark/evaluate-browser.ts';
import { scoreResult, type AuthenticatedTranscript, type ScoreInput } from '../scripts/benchmark/score-result.ts';

function digest(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function sealedTranscript(root: string, failures: string[] = []): AuthenticatedTranscript {
  const evidence = ['transcript', 'timing', 'server-stdout', 'server-stderr', 'server-exit'] as const;
  return { schemaVersion: 'product-ux-browser-transcript-v1', steps: [], failures, evidence: evidence.map((kind) => { const path = join(root, kind); writeFileSync(path, kind); return { kind, path, sha256: digest(path) }; }) };
}
function input(transcript: AuthenticatedTranscript, overrides: Partial<ScoreInput> = {}): ScoreInput {
  return { schemaVersion: 'product-ux-score-input-v1', transcript, ux: { taskCompletion: 15, informationArchitecture: 10, discoverability: 10, interactionFeedback: 10, errorPreventionRecovery: 5, mobileResponsive: 5, accessibility: 5 }, synthesisMap: { references: [{ traitNamed: 'found', traitVisible: 'found', adaptation: 'found', distance: { numerator: 1, denominator: 2 } }, { traitNamed: 'partial', traitVisible: 'found', adaptation: 'partial', distance: { numerator: 2, denominator: 5 } }], integration: { noClone: 'found', oneSystem: 'found', explicitDeclines: 'found' } }, visual: { typographySpacingConsistency: 5, purposeFit: 5, nonTemplateFinish: 5 }, candidateId: 'first', ...overrides };
}
const score = (value: ScoreInput, options: Parameters<typeof scoreResult>[1] = {}) => scoreResult(value, { identityMap: { first: 'A' }, ...options });
async function freePort(): Promise<number> { const server = createServer(); await new Promise<void>((done) => server.listen(0, '127.0.0.1', done)); const address = server.address(); await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())); if (!address || typeof address === 'string') throw new Error('no fixture port'); return address.port; }
const fixtureServer = `const http=require('node:http');const port=Number(process.argv[2]);const page='<!doctype html><style>body{background:#fff;color:#111}button{width:44px;height:44px}</style><button aria-label="Apply">Apply</button><div role="status" aria-label="waiting">waiting</div><script>document.querySelector("button").onclick=()=>{const s=document.querySelector("[role=status]");s.textContent="saved";s.setAttribute("aria-label","saved")}</script>';http.createServer((q,r)=>{if(q.url==='/health')return r.end('ok');if(q.url==='/reset'&&q.method==='POST')return r.end('ok');r.setHeader('content-type','text/html');r.end(page)}).listen(port,'127.0.0.1');`;

test('scores exact seven UX anchors, synthesis rationals and visual anchors', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-score-'));
  try { const result = score(input(sealedTranscript(root))); assert.deepEqual(result.categoryScores, { ux: 60, synthesis: 21, visual: 15 }); assert.equal(result.score, 96); assert.equal(result.referenceDistancePass, true); assert.equal(result.anonymizedId, 'A');
    const fractional = score(input(sealedTranscript(root), { synthesisMap: { references: [{ traitNamed: 'partial', traitVisible: 'absent', adaptation: 'partial', distance: { numerator: 3, denominator: 5 } }], integration: { noClone: 'absent', oneSystem: 'partial', explicitDeclines: 'found' } } })); assert.equal(fractional.categoryScores.synthesis, 11); assert.equal(fractional.referenceDistancePass, false); assert.ok(fractional.floors.includes('reference-distance'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('evidence floors come only from sealed transcript and public regression requires all comparisons', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-score-'));
  try { const transcript = sealedTranscript(root); const base = score(input(transcript)); const sealed = { result: base, transcript }; const forged = score({ ...input(transcript), ...({ missingEvidence: ['anything'], taskFailures: 1 } as object) }); assert.equal(forged.score, base.score); const passed = score(input(transcript), { regression: { sealedBefore: sealed, sealedAfter: sealed, publicFixtureBefore: [sealed], publicFixtureAfter: [sealed], marketingGuard: { before: 80, after: 80, threshold: 0 } } }); assert.equal(passed.publicRegressionPass, true); const marketingFailed = score(input(transcript), { regression: { sealedBefore: sealed, sealedAfter: sealed, publicFixtureBefore: [sealed], publicFixtureAfter: [sealed], marketingGuard: { before: 80, after: 79, threshold: 0 } } }); assert.equal(marketingFailed.publicRegressionPass, false); writeFileSync(transcript.evidence[0]!.path, 'forged'); assert.ok(score(input(transcript)).floors.includes('missing-evidence'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('manifest authorization is checked before spawn and semantic locators reject ambiguity', async () => {
  const candidate = { schemaVersion: 'product-ux-benchmark-v1' as const, mode: 'candidate' as const, runtimeSha256: 'a'.repeat(64), conditionSha256: 'b'.repeat(64), server: { argv: ['definitely-not-a-command'], port: 4173, healthPath: '/health', resetPath: '/reset' }, scenarios: [{ id: 'x', routes: ['/'], tasks: [{ id: 'x', route: '/', actions: [], assertions: [] }] }] };
  await assert.rejects(evaluateBrowser(candidate, join(tmpdir(), 'never-spawned')), /authorization binding/); assert.throws(() => validateBenchmarkManifest({ ...candidate, mode: 'synthetic', fixtureId: 'remote' }), /invalid manifest|local fixture/);
  let role: string | undefined; const page = { getByRole(received: string) { role = received; return { count: async () => 2 }; } }; await assert.rejects(resolveSemanticLocator(page as never, { role: 'button', name: 'Save' }), /ambiguous/); assert.equal(role, 'button');
  const bound = { ...candidate, authorization: { gate: 'Gate-2' as const, manifestSha256: '', runtimeSha256: candidate.runtimeSha256, conditionSha256: candidate.conditionSha256 } }; bound.authorization.manifestSha256 = manifestAuthorizationHash(bound); assert.doesNotThrow(() => validateBenchmarkManifest(bound));
});
test('synthetic local walk retains scenario state, honors isolation, and seals transcript evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-')); const script = join(root, 'server.cjs'), artifacts = join(root, 'artifacts'), port = await freePort(); writeFileSync(script, fixtureServer);
  const manifest = { schemaVersion: 'product-ux-benchmark-v1' as const, mode: 'synthetic' as const, fixtureId: 'local-browser-fixture', server: { argv: [process.execPath, script, String(port)], cwd: root, env: {}, port, healthPath: '/health', resetPath: '/reset' }, scenarios: [{ id: 'fixture', routes: ['/'], tasks: [{ id: 'save', route: '/', actions: [{ kind: 'click' as const, locator: { role: 'button', name: 'Apply' }, acknowledgement: { kind: 'visible' as const, locator: { role: 'status', name: 'saved' } } }], assertions: [] }, { id: 'stateful', route: '/', actions: [], assertions: [{ kind: 'visible' as const, locator: { role: 'status', name: 'saved' } }] }, { id: 'isolated', route: '/', isolated: true as const, actions: [], assertions: [{ kind: 'visible' as const, locator: { role: 'status', name: 'waiting' } }] }] }] };
  try { const transcript = await evaluateBrowser(manifest, artifacts); assert.equal(transcript.failures.length, 0); for (const width of [1280, 390, 320]) assert.ok(transcript.steps.some((step) => step.scenario === 'fixture' && step.task === 'stateful') && transcript.evidence.some((item) => item.kind === 'screenshot' && item.path.includes(`-${width}-`))); for (const kind of ['transcript', 'timing', 'server-stdout', 'server-stderr', 'server-exit']) assert.ok(transcript.evidence.some((item) => item.kind === kind)); } finally { rmSync(root, { recursive: true, force: true }); }
});
const observeServer = `const http=require('node:http');const port=Number(process.argv[2]);const page='<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0;background:#fff;color:#111}button{width:44px;height:44px}</style><h2 aria-label="ticket-id" data-status="waiting">4821</h2><span role="status" aria-label="sent-at" data-sent="2026-07-16T04:59:00Z">now</span><button aria-label="row">a</button><button aria-label="row">b</button>';http.createServer((q,r)=>{if(q.url==='/health')return r.end('ok');if(q.url==='/reset'&&q.method==='POST')return r.end('ok');r.setHeader('content-type','text/html');r.end(page)}).listen(port,'127.0.0.1');`;
const observeBase = (assertions: unknown[]) => ({ schemaVersion: 'product-ux-benchmark-v1' as const, mode: 'synthetic' as const, fixtureId: 'local-observe', server: { argv: ['x'], port: 5, healthPath: '/health', resetPath: '/reset' }, scenarios: [{ id: 'o', routes: ['/'], tasks: [{ id: 'o', route: '/', actions: [], assertions }] }] });

test('observe assertions require viewport-bindable ids, properties, locators, and expectations', () => {
  assert.doesNotThrow(() => validateBenchmarkManifest(observeBase([
    { kind: 'observe', observation: 'id', property: 'text', locator: { role: 'heading', name: 'ticket-id' }, equals: '4821' },
    { kind: 'observe', observation: 'status', property: 'attribute', locator: { role: 'heading', name: 'ticket-id' }, attribute: 'data-status', equals: 'waiting' },
    { kind: 'observe', observation: 'sent', property: 'timestamp', locator: { role: 'status', name: 'sent-at' }, attribute: 'data-sent' },
    { kind: 'observe', observation: 'rows', property: 'count', locator: { role: 'button', name: 'row' }, min: 2, max: 2 },
  ])));
  assert.throws(() => validateBenchmarkManifest(observeBase([{ kind: 'observe', property: 'text', locator: { role: 'heading', name: 'x' }, equals: 'y' }])), /observation id/);
  assert.throws(() => validateBenchmarkManifest(observeBase([{ kind: 'observe', observation: 'a', locator: { role: 'heading', name: 'x' }, equals: 'y' }])), /supported property/);
  assert.throws(() => validateBenchmarkManifest(observeBase([{ kind: 'observe', observation: 'a', property: 'text', equals: 'y' }])), /role\/name locator/);
  assert.throws(() => validateBenchmarkManifest(observeBase([{ kind: 'observe', observation: 'a', property: 'text', locator: { role: 'heading', name: 'x' } }])), /requires equals/);
  assert.throws(() => validateBenchmarkManifest(observeBase([{ kind: 'observe', observation: 'a', property: 'attribute', locator: { role: 'heading', name: 'x' }, equals: 'y' }])), /requires an attribute/);
  assert.throws(() => validateBenchmarkManifest(observeBase([{ kind: 'observe', observation: 'a', property: 'count', locator: { role: 'button', name: 'x' } }])), /count requires min or max/);
  assert.throws(() => validateBenchmarkManifest(observeBase([{ kind: 'observe', observation: 'a', property: 'count', locator: { role: 'button', name: 'x' }, min: 3, max: 1 }])), /min must not exceed max/);
  assert.throws(() => validateBenchmarkManifest(observeBase([
    { kind: 'observe', observation: 'dupe', property: 'count', locator: { role: 'button', name: 'x' }, min: 1 },
    { kind: 'observe', observation: 'dupe', property: 'count', locator: { role: 'button', name: 'y' }, min: 1 },
  ])), /duplicate observation id/);
});

test('observe records machine-readable values bound to each concrete viewport', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-observe-')); const script = join(root, 'server.cjs'), artifacts = join(root, 'artifacts'), port = await freePort(); writeFileSync(script, observeServer);
  const manifest = { schemaVersion: 'product-ux-benchmark-v1' as const, mode: 'synthetic' as const, fixtureId: 'local-observe-fixture', server: { argv: [process.execPath, script, String(port)], cwd: root, env: {}, port, healthPath: '/health', resetPath: '/reset' }, scenarios: [{ id: 'obs', routes: ['/'], tasks: [{ id: 'read', route: '/', actions: [], assertions: [
    { kind: 'observe' as const, observation: 'ticket-id', property: 'text' as const, locator: { role: 'heading', name: 'ticket-id' }, equals: '4821' },
    { kind: 'observe' as const, observation: 'ticket-status', property: 'attribute' as const, locator: { role: 'heading', name: 'ticket-id' }, attribute: 'data-status', equals: 'waiting' },
    { kind: 'observe' as const, observation: 'sent-at', property: 'timestamp' as const, locator: { role: 'status', name: 'sent-at' }, attribute: 'data-sent' },
    { kind: 'observe' as const, observation: 'reply-rows', property: 'count' as const, locator: { role: 'button', name: 'row' }, min: 2, max: 2 },
  ] }] }] };
  try {
    const transcript = await evaluateBrowser(manifest, artifacts); assert.equal(transcript.failures.length, 0);
    for (const step of transcript.steps) { assert.ok(step.viewport && Number.isInteger(step.viewport.width) && Number.isInteger(step.viewport.height), 'every step binds a concrete viewport'); }
    for (const width of [1280, 390]) {
      const id = transcript.steps.find((step) => step.observation === 'ticket-id' && step.viewport.width === width); assert.equal(id?.observed, '4821');
      const status = transcript.steps.find((step) => step.observation === 'ticket-status' && step.viewport.width === width); assert.equal(status?.observed, 'waiting');
      const sent = transcript.steps.find((step) => step.observation === 'sent-at' && step.viewport.width === width); assert.equal(sent?.observed, '2026-07-16T04:59:00Z');
      const rows = transcript.steps.find((step) => step.observation === 'reply-rows' && step.viewport.width === width); assert.equal(rows?.observed, 2);
    }
    const desktopIds = transcript.steps.filter((step) => step.observation === 'ticket-id' && step.viewport.width === 1280);
    const mobileIds = transcript.steps.filter((step) => step.observation === 'ticket-id' && step.viewport.width === 390);
    assert.ok(desktopIds.length === 1 && mobileIds.length === 1, 'desktop and mobile observations are individually distinguishable');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
