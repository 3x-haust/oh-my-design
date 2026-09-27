import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { designAdmissionFixture, admissionHash } from './helpers/design-admission.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { browseFixture } from './helpers/browse-fixture.ts';
import { runBrowseDriver } from '../core/ref/browse/driver.ts';
import { parseBrowseCommand } from '../core/ref/browse/parser.ts';
import { executeBrowseCommand } from '../core/ref/browse/client.ts';
import { verifyBrowseSession } from '../core/ref/browse/verification.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { loadRefs } from '../core/ref/store.ts';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import { parseReferenceResearch, publishReferenceResearch, readPublishedReferenceResearch } from '../core/ref/reference-research.ts';
import { publishReferenceAnalysis, readReferenceAnalysis } from '../core/ref/reference-analysis.ts';
import { readWholeScreenReferenceHandoff } from '../core/ref/reference-handoff.ts';
import { referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { advanceReferenceDiscoveryWork } from '../core/ref/discovery-advance.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { assertProjectRunMutationInventory } from '../core/runtime/project-write-inventory.ts';
import { validateBrowseMarketLocal, readBrowseMarketExecutions } from '../core/ref/browse/market.ts';
import type { ResearchSource } from '../core/ref/reference-research-types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));

test('browse market claims require visible source-bound bytes, not hidden copy or a query/locale', { timeout: 60_000 }, async t => {
  const fixture = designAdmissionFixture(t), site = await browseFixture(), { root } = fixture;
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const current = { sourceContractSha256: 'a'.repeat(64), request: 'Inspect local account services' };
  let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined;
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), current, invocation, writer, { launch: async binding => driver = await runBrowseDriver(binding, { transport: site.transport }) });
  try {
    await run(['start', '--lane', 'domain']);
    await run(['goto', 'https://local.fixture.test/market', '--scope', 'target-market', '--reason', 'Inspect this service claim for the explicit target market.']);
    const shot = await run(['shot']); await run(['keep', '--reason', 'The whole account service screen makes its market and task scope explicit.']);
    const end = await run(['end']); assert.equal(end.ok, true);
    const verified = verifyBrowseSession(root, end.seal!), keep = verified.seal.keeps[0]!, capture = verified.events[keep.capture.seq]!;
    const observation = verified.observations.get(capture.observation!.sha256)!;
    const visible = observation.text.split('\n').find(text => text.includes('United States'))!;
    const source: ResearchSource = { id: 'local-account', url: observation.url, observedAt: capture.time.slice(0, 10), decision: 'Account support', finding: 'Task-specific visible market scope',
      evidence: end.retained![0]!.image, capture: end.retained![0]!.capture,
      provenance: { kind: 'recorded-browse', session: end.seal!, capture: keep.capture, keep: keep.keep } };
    const local = { sourceId: source.id, evidenceSha256: source.evidence.sha256, scope: 'service' as const, basis: 'market-browse-observation' as const,
      provenanceReceiptSha256: end.seal!.sha256, browseEvent: keep.capture, claim: { kind: 'source-task-text' as const, textSha256: admissionHash(visible), linkUrl: null } };
    assert.doesNotThrow(() => validateBrowseMarketLocal(root, source, local, 'DOMAIN', 'US', ['United States'], 'account'));
    assert.throws(() => validateBrowseMarketLocal(root, source, { ...local, claim: { ...local.claim, textSha256: admissionHash('South Korea account services for local residents') } }, 'DOMAIN', 'KR', ['South Korea'], 'account'), /BROWSE_SCOPE/);
    assert.throws(() => validateBrowseMarketLocal(root, source, local, 'DOMAIN', 'KR', ['United States'], 'account'), /BROWSE_SCOPE/);
    assert.equal(readBrowseMarketExecutions(root, [end.seal!]).length, 1);
    assert.equal(shot.observation!.text.includes('South Korea'), false);
  } finally { await driver?.close(); await site.close(); }
});
test('v8 mixed research admits whole-screen browse evidence into the real image board; analysis feeds maker-only handoff', { timeout: 90_000 }, async t => {
  const fixture = designAdmissionFixture(t), site = await browseFixture();
  const { root } = fixture, invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const current = { sourceContractSha256: fixture.research.sourceContractSha256, request: 'Inspect whole-screen dashboard references' };
  let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined, clock = 0;
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), current, invocation, writer, {
    launch: async binding => driver = await runBrowseDriver(binding, { transport: site.transport, monotonic: () => clock += 1001 }),
  });
  try {
    await run(['start', '--lane', 'design']);
    await run(['goto', 'https://independent.fixture.test/other', '--reason', 'Inspect the complete task list screen as another direction.']);
    await run(['shot']);
    await run(['keep', '--source-app', 'Independent Service', '--rights', 'allowed', '--reason', 'The whole screen shows a compact work region and clear task hierarchy.']);
    const ended = await run(['end']); assert.equal(ended.ok, true, JSON.stringify(ended.error));
    const native = loadRefs(root).find(ref => ref.browse)!;
    const fragment = persistImageFragment(root, { inputPath: native.imagePath!, provenance: { sourcePage: native.source, captureRegion: 'whole screen', licenseStatus: 'allowed', rightsNotes: 'Permitted local design study only', capturedAt: native.capturedAt },
      transfer: { visualRole: 'whole task screen', principles: ['Compare hierarchy and density, not source content.'] } }, invocation);
    const fragmentPath = `.omd/refs/design/fragments/${fragment.id}.json`;
    const verified = verifyBrowseSession(root, ended.seal!);
    const entry = verified.events.find(event => event.action.verb === 'goto')!;
    const source = { id: refIdentity(native.source, native.component), url: native.source, observedAt: native.capturedAt.slice(0, 10), decision: 'Task hierarchy', finding: 'Compact work region with visible context',
      evidence: { path: fragment.imagePath, sha256: fragment.sha256 }, capture: { path: fragmentPath, sha256: admissionHash(readFileSync(join(root, fragmentPath))) },
      visualRole: 'visual-direction', visualAssessment: { composition: 'Compact work region', typography: 'Readable hierarchy', density: 'Useful task density', imagery: 'No invented imagery', transfer: 'Hierarchy and grouping', avoid: 'Brand and exact content' },
      provenance: { kind: 'recorded-browse', session: ended.seal!, capture: native.browse!.capture, keep: native.browse!.keep },
      discovery: { kind: 'recorded-browse', url: native.source, access: 'public', qualityReason: 'Whole task screen provides a coherent independent hierarchy.', session: ended.seal!, entry: { seq: entry.seq, hash: entry.hash } } };
    fixture.board.candidates[0]!.pieces.push({ ...fixture.board.candidates[0]!.pieces[0]!, sourceKind: 'image-fragment', referenceId: fragment.id, slotId: 'whole-screen', targetComponent: 'Workspace', targetSelector: '#workspace', grid: { column: 1, span: 12, order: 1 } });
    fixture.refreshBoard();
    const input = { ...fixture.research, schema: 'reference-research-v8', marketCoverage: null,
      designReference: { ...fixture.research.designReference, browseSessions: [ended.seal!], sources: [...fixture.research.designReference.sources, source] } };
    const research = parseReferenceResearch(input); publishReferenceResearch(root, research, { expectedSourceContractSha256: current.sourceContractSha256, benchmarkRequired: false }, writer);
    assert.equal(readPublishedReferenceResearch(root).schema, 'reference-research-v8');
    assert.equal(JSON.parse(readFileSync(join(root, '.omd/refs/design/research.json'), 'utf8')).schema, 'design-references-v3');
    assert.throws(() => parseReferenceResearch({ ...input, schema: 'reference-research-v7' }), /KEYS/);
    const evidence = [{ status: 'user-provided', reference: 'test-request' }];
    const domainBytes = JSON.stringify({ schema: 'domain-brief-v1', request: current.request, domain: 'service', summary: 'Account task workspace',
      surfaces: [{ name: 'home', purpose: 'Inspect current account work', evidence }], coreObjects: [{ name: 'account', evidence }], audience: { description: 'account owners', evidence },
      referenceQueries: { component: ['account overview'], craft: ['state feedback'], mood: ['readable workspace'] },
      planning: { businessGoal: { text: 'Reduce inspection effort' }, successSignal: { text: 'Find relevant account detail' }, nonGoals: [{ text: 'No transactions' }] } });
    writer.write('.omd/domain-brief.json', domainBytes);
    const retained = ended.retained![0]!;
    const analysis = { schema: 'reference-analysis-v1', sourceContractSha256: current.sourceContractSha256, domainBriefSha256: admissionHash(domainBytes),
      references: [{ referenceId: source.id, capture: retained.capture, image: retained.image, screenType: 'Account overview', mainTask: 'Inspect account', hierarchy: 'Task heading precedes work', density: 'Compact visible context', typography: 'Readable heading contrast', components: 'Task group and disclosure' }],
      selectedReferenceIds: [source.id], patterns: [{ pattern: 'Persistent task context', referenceIds: [source.id], decision: 'apply', reason: 'Keep the work object visible while inspecting details.' }],
      screens: [{ surface: 'home', target: { route: '/', state: 'initial' },
        domain: { referenceIds: [], coverage: 'brief-derived', gap: 'No matching recorded domain walkthrough yet.', application: 'Use the requested account task.', doNotTransfer: 'Do not invent service capabilities.', reason: 'Task is brief-authoritative.' },
        design: { referenceIds: [source.id], coverage: 'partial', gap: 'Responsive states remain unobserved.', application: 'Retain task context and readable hierarchy.', doNotTransfer: 'Do not copy source branding.', reason: 'Observed grouping fits the task.' }, checks: ['Inspect task context at the destination viewport.'] }] };
    publishReferenceAnalysis(root, analysis, current, writer); assert.equal(readReferenceAnalysis(root, current).analysis.patterns.length, 1);
    const maker = readWholeScreenReferenceHandoff(root, 'composer', current); assert.ok('images' in maker); assert.equal(maker.images!.length, 1); assert.equal(maker.images![0]!.path, native.imagePath);
    const blind = readWholeScreenReferenceHandoff(root, 'eye', current); assert.equal('images' in blind, false); assert.doesNotMatch(JSON.stringify(blind), /independent|\.omd\/|pattern|sourceUrl/);
    const before = readFileSync(join(root, '.omd/reference-analysis.json'));
    assert.throws(() => publishReferenceAnalysis(root, { ...analysis, selectedReferenceIds: ['missing'] }, current, writer), /unknown/);
    assert.deepEqual(readFileSync(join(root, '.omd/reference-analysis.json')), before);
    assert.throws(() => publishReferenceAnalysis(root, { ...analysis, screens: [] }, current, writer), /screens/);
  } finally { await driver?.close(); await site.close(); }
});

test('default work is model-directed browsing and advance never issues a catalogue GET', async t => {
  const fixture = designAdmissionFixture(t);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  const route = routeAdaptiveFlow(input), work = referenceDiscoveryWork(fixture.root, route);
  assert.equal(work.schema, 'reference-discovery-work-v2'); assert.equal(work.action?.kind, 'start-browse'); assert.equal(work.action?.lane, 'design');
  const advance = await advanceReferenceDiscoveryWork(fixture.root, route, fixture.writer);
  assert.equal(advance.outcome, 'needs-model-action'); assert.equal(advance.receipt, null); assert.equal(advance.work.workSha256, work.workSha256);
  assert.equal(existsSync(join(fixture.root, '.omd/.cache/ref-browse/current.json')), false);
});

test('packaged CLI runs a persistent daemon across separate start/status/end processes without network', { timeout: 90_000 }, t => {
  const fixture = designAdmissionFixture(t);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  publishTestAdaptiveRoute(fixture.root, input);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [CLI, 'ref', 'browse', ...args, '--json'], { cwd: fixture.root, env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout);
  };
  const start = run('start', '--lane', 'design');
  try { const status = run('status'); assert.equal(status.sessionId, start.sessionId); assert.equal(status.head, start.head); }
  finally { assert.equal(run('end').outcome, 'sealed'); }
});

test('guard inventory includes the private daemon import graph', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = assertProjectRunMutationInventory(root);
  assert.ok(result.owners.some(owner => owner.filePath === 'core/ref/browse/daemon.ts'));
  assert.deepEqual(assertProjectRunMutationInventory(root, 'core/ref/browse/daemon.ts').unguardedMutations, []);
});
