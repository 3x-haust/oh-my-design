import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { browseFixture } from './helpers/browse-fixture.ts';
import { runBrowseDriver } from '../core/ref/browse/driver.ts';
import { parseBrowseCommand } from '../core/ref/browse/parser.ts';
import { executeBrowseCommand } from '../core/ref/browse/client.ts';
import { loadRefs } from '../core/ref/store.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { publishReferenceAnalysis } from '../core/ref/reference-analysis.ts';
import { readWholeScreenReferenceHandoff } from '../core/ref/reference-handoff.ts';
import { selectedReferenceMakerProjection } from '../core/runtime/native-maker-reference-images.ts';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { routeAdaptiveFlow, readPersistedRoute } from '../core/route/index.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { publishTestAdaptiveRoute, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { admitBrowseDirections } from './helpers/browse-admission.ts';

test('current maker projection delivers every selected whole original and refuses later image drift', { timeout: 90_000 }, async t => {
  const fixture = designAdmissionFixture(t), site = await browseFixture();
  const { root } = fixture;
  const skeleton = inputSkeleton('product-route-input').skeleton;
  assert.ok(typeof skeleton === 'object' && skeleton !== null && !Array.isArray(skeleton));
  const invocation = publishTestAdaptiveRoute(root, { ...skeleton,
    request: 'Inspect selected whole task screens without claiming independent source diversity.' });
  const writer = createTestProjectWriteAdapter(root, invocation);
  const route = readPersistedRoute(root, invocation);
  const current = { sourceContractSha256: route.sourceContractSha256, request: route.request };
  let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined, clock = 0;
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), current,
    invocation, writer, { launch: async binding => driver = await runBrowseDriver(binding,
      { transport: site.transport, monotonic: () => clock += 1001 }) });
  try {
    await run(['start', '--lane', 'design']);
    // Repeated source pixels test delivery identity, not four independent visual directions.
    for (let index = 1; index <= 4; index += 1) {
      const visited = await run(['goto', `https://independent.fixture.test/other?part=${index}`,
        '--reason', 'Inspect this recorded whole task screen without changing its pixels.']);
      assert.equal(visited.ok, true, JSON.stringify(visited.error));
      const shot = await run(['shot']);
      assert.equal(shot.ok, true, JSON.stringify(shot.error));
      const keep = await run(['keep', '--rights', 'allowed',
        '--reason', 'Retain this whole observation for the selected-image delivery regression.']);
      assert.equal(keep.ok, true, JSON.stringify(keep.error));
    }
    const ended = await run(['end']);
    assert.equal(ended.ok, true, JSON.stringify(ended.error));
    assert.ok(ended.retained);
    assert.equal(ended.retained.length, 4);
    const refs = loadRefs(root);
    await admitBrowseDirections(t, root, invocation, current,
      ended.retained.map(retained => {
        const reference = refs.find(ref => ref.imagePath === retained.image.path);
        assert.ok(reference);
        return reference;
      }));
    const references = ended.retained.map(retained => {
      const native = refs.find(ref => ref.imagePath === retained.image.path);
      assert.ok(native);
      return { referenceId: refIdentity(native.source, native.component),
        capture: retained.capture, image: retained.image, screenType: 'Task screen',
        mainTask: 'Inspect current work', hierarchy: 'Task heading before work',
        density: 'Compact', typography: 'Readable headings', components: 'Task region' };
    });
    const evidence = [{ status: 'user-provided', reference: 'test-request' }];
    const domainBytes = JSON.stringify({ schema: 'domain-brief-v1', request: current.request,
      domain: 'service', summary: 'Account workspace',
      surfaces: [{ name: 'home', purpose: 'Inspect work', evidence }],
      coreObjects: [{ name: 'account', evidence }], audience: { description: 'account owners', evidence },
      referenceQueries: { component: ['account overview'], craft: ['state feedback'], mood: ['workspace'] },
      planning: {
        businessGoal: { text: 'Explore work hierarchy', disposition: 'non-factual-working-decision' },
        successSignal: { text: 'Find the work region', disposition: 'non-factual-working-decision' },
        nonGoals: [{ text: 'No transactions', disposition: 'omit-from-production-claims' }],
      } });
    writer.write('.omd/domain-brief.json', domainBytes);
    const ids = references.map(ref => ref.referenceId);
    publishReferenceAnalysis(root, { schema: 'reference-analysis-v1',
      sourceContractSha256: current.sourceContractSha256, domainBriefSha256: sha256(domainBytes),
      references, selectedReferenceIds: ids, patterns: [],
      screens: [{ surface: 'home', target: { route: '/', state: 'initial' },
        domain: { referenceIds: [], coverage: 'brief-derived', gap: 'No domain walkthrough.',
          application: 'Preserve the requested task.', doNotTransfer: 'No invented capabilities.',
          reason: 'The requested task is authoritative.' },
        design: { referenceIds: ids, coverage: 'partial', gap: 'Repeated pixels are not source diversity.',
          application: 'Inspect the observed grouping.', doNotTransfer: 'No source branding.',
          reason: 'These are transport fixtures, not evidence of design quality.' },
        checks: ['Inspect destination task hierarchy.'] }] }, current, writer);
    const handoff = readWholeScreenReferenceHandoff(root, 'hand', current);
    assert.ok('images' in handoff);
    assert.equal(handoff.images.length, 4);
    const strategy = routeAdaptiveFlow(JSON.parse(readFileSync(
      new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'))).strategy;
    const project = () => selectedReferenceMakerProjection(root, { strategy, ...current },
      { role: 'omd-hand', branch: 'standard' });
    const delivered = project();
    assert.equal(delivered.renders.length, handoff.images.length);
    for (const image of handoff.images) {
      assert.ok(delivered.renders.some(render => render.captureSha256 === image.sha256
        && Buffer.from(render.pngBase64, 'base64').equals(readFileSync(join(root, image.path)))));
    }
    const last = handoff.images.at(-1);
    assert.ok(last);
    const path = join(root, last.path), bytes = readFileSync(path);
    const analysisBytes = readFileSync(join(root, '.omd/reference-analysis.json'));
    writeFileSync(path, Buffer.from('corrupt image'));
    assert.throws(project, /image|drift|changed|evidence bytes differ/i);
    assert.deepEqual(readFileSync(join(root, '.omd/reference-analysis.json')), analysisBytes);
    writeFileSync(path, bytes);
  } finally { await driver?.close(); await site.close(); }
});
