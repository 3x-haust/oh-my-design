import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { componentGallerySearched, galleryFamily, isComponentGallerySource, referenceBreadth } from '../core/ref/component-references.ts';

// The brief comes first for a new surface; these tests exercise the stages after it.
const TEST_BRIEF = { schema: 'design-brief-v1', audience: 'Developers',
  personas: [{ name: 'Dev', context: 'Desktop', job: 'Judge it', mustBelieveIn5s: 'It designs', dealBreaker: 'No proof' }], visitorQuestions: ['What is it?'], message: 'It designs.',
  sections: [{ name: 'hero', question: 'What is it?', says: 'A harness.', shows: 'The mark.' }], cut: [{ what: 'Internals', why: 'Not needed.' }],
  concept: { source: 'The mark', idea: 'Lift', typeAndGraphic: 'Wrap' },
  directions: { options: ['Lift', 'Split', 'Terminal'], chosen: 'Lift', why: 'Only this product owns it.' }, onlyThisProduct: 'The mark.',
  heroProof: { mode: 'real-output', shows: 'A page it made.', because: 'Seeing is believing.' },
  decisions: Object.fromEntries(['ground', 'accent', 'type', 'layout'].map(key => [key, { choice: key, because: 'From the brand kit in the material folder.' }])),
  motion: 'Lift on scroll.', voice: 'Plain.' };

test('component gallery originals are recognised by work page or gallery image host', () => {
  for (const url of ['https://dribbble.com/shots/24131452-Filter-panel', 'https://www.behance.net/gallery/243713399/SHEIN-Filter',
    'https://www.pinterest.com/pin/123456789/', 'https://notefolio.net/studio_kim/412345',
    'https://i.pinimg.com/736x/60/80/c6/6080c6.jpg', 'https://cdn.dribbble.com/userupload/1.png']) {
    assert.equal(isComponentGallerySource(url), true, url);
  }
  for (const url of ['https://vite.dev', 'https://www.framer.com', 'https://dribbble.com/search/filter', 'not a url']) {
    assert.equal(isComponentGallerySource(url), false, url);
  }
});

test('kept references are said back as finished sites and gallery shots, without a quota', t => {
  assert.equal(galleryFamily('https://search.naver.com/search.naver?where=image&query=pinterest%20landing%20hero'), 'pinterest');
  assert.equal(galleryFamily('https://search.naver.com/search.naver?query=pinterest'), null);
  assert.equal(galleryFamily('https://www.cosmos.so/e/123'), 'cosmos');
  assert.equal(galleryFamily('https://rig.ai/'), null);
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-breadth-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(referenceBreadth(root), 'References kept so far: 0 finished sites, 0 UI or graphic shots.');
  mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
  const keep = (name: string, sourceUrl: string) => writeFileSync(join(root, `.omd/refs/design/${name}.json`), JSON.stringify({
    source: sourceUrl, sourceUrl, component: name, kind: 'image', imagePath: `.omd/refs/design/${name}.png`, researchLane: 'design' }));
  keep('rig', 'https://rig.ai/?ref=onepagelove');
  keep('shot-a', 'https://dribbble.com/shots/1-hero');
  keep('shot-b', 'https://dribbble.com/shots/2-faq');
  keep('pin', 'https://i.pinimg.com/736x/aa.jpg');
  assert.equal(referenceBreadth(root), 'References kept so far: 1 finished site (rig.ai), 3 UI or graphic shots (dribbble 2, pinterest 1).');
});

test('a recorded gallery search counts as an attempt; other searches do not', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-component-refs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(componentGallerySearched(root), false);
  const session = join(root, '.omd/discovery/browse/abc');
  mkdirSync(session, { recursive: true });
  writeFileSync(join(session, 'trace.jsonl'), `${JSON.stringify({ action: { provider: 'google', query: 'x', verb: 'search' } })}\n`);
  assert.equal(componentGallerySearched(root), false);
  writeFileSync(join(session, 'trace.jsonl'), `${JSON.stringify({ action: { provider: 'dribbble', query: 'filter ui design', verb: 'search' } })}\n`);
  assert.equal(componentGallerySearched(root), true);
});

test('stage next points a new product at component references until a gallery was searched and something kept', async t => {
  const { realpathSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { nextStageWork } = await import('../core/stage/next.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-component-stage-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a new product landing page.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  publishAdaptiveRoute(root, modelLedInput(request), writer, invocation);
  const packRoot = fileURLToPath(new URL('../core', import.meta.url));
  mkdirSync(join(root, '.omd'), { recursive: true });
  writeFileSync(join(root, '.omd/brief.json'), JSON.stringify(TEST_BRIEF));
  const first = nextStageWork(root, packRoot, invocation);
  assert.equal(first.stage, 'references', JSON.stringify(first));
  assert.equal(first.next, 'omd ref browse start --lane design --json');
  assert.match(first.instruction, /ui design/);
  const session = join(root, '.omd/discovery/browse/s1');
  mkdirSync(session, { recursive: true });
  writeFileSync(join(session, 'trace.jsonl'), `${JSON.stringify({ action: { provider: 'notefolio', query: '필터 UI', verb: 'search' } })}\n`);
  // Searched but nothing kept: looking and letting everything go is not yet a reference.
  assert.equal(nextStageWork(root, packRoot, invocation).stage, 'references');
  mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
  writeFileSync(join(root, '.omd/refs/design/kept.json'), JSON.stringify({ source: 'https://notefolio.net/a/1', sourceUrl: 'https://notefolio.net/a/1',
    component: 'filter', kind: 'image', imagePath: '.omd/refs/design/kept.png', researchLane: 'design' }));
  // Kept pages next go to the isolated direction review before one becomes the primary.
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'review-reference-directions');
  writeFileSync(join(root, '.omd/reference-direction-admission.json'), '{}');
  assert.notEqual(nextStageWork(root, packRoot, invocation).stage, 'references');
});

test('production entry warns a new landing that skipped gallery references or graphic comparison, and only then', async t => {
  const { realpathSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { checkProductionReadiness } = await import('../core/brief/production-readiness.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const packRoot = fileURLToPath(new URL('../core', import.meta.url));
  const publish = (taskNeed: string) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-new-surface-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const request = 'Build a landing page for this project.';
    const { invocation, writer } = createModelLedRouteContext(root, request);
    const input = modelLedInput(request);
    (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
    publishAdaptiveRoute(root, input, writer, invocation);
    return { root, warnings: () => checkProductionReadiness(root, invocation, packRoot).warnings.map(row => row.split(';')[0]) };
  };
  const landing = publish('new-marketing');
  assert.deepEqual(landing.warnings(), ['COMPONENT_REFERENCES_MISSING', 'GRAPHIC_COMPARISON_MISSING']);

  const session = join(landing.root, '.omd/discovery/browse/s1');
  mkdirSync(session, { recursive: true });
  writeFileSync(join(session, 'trace.jsonl'), `${JSON.stringify({ action: { provider: 'cosmos', query: 'product illustration', verb: 'search' } })}\n`);
  mkdirSync(join(landing.root, '.omd/refs/design'), { recursive: true });
  writeFileSync(join(landing.root, '.omd/refs/design/kept.json'), JSON.stringify({ source: 'https://cosmos.so/e/1', sourceUrl: 'https://cosmos.so/e/1',
    component: 'hero', kind: 'image', imagePath: '.omd/refs/design/kept.png', researchLane: 'design' }));
  mkdirSync(join(landing.root, '.omd/taste/graphics'), { recursive: true });
  writeFileSync(join(landing.root, '.omd/taste/graphics/record.json'), '{}');
  assert.deepEqual(landing.warnings(), ['GRAPHIC_COMPARISON_MISSING']);
  writeFileSync(join(landing.root, '.omd/taste/graphics/record.json'), JSON.stringify({ schema: 'omd-taste-graphic-review-v1', summary: { verdict: 'not-distinguishable' } }));
  assert.deepEqual(landing.warnings(), []);
  assert.deepEqual(publish('existing-product-change').warnings(), []);
});

test('a new landing finishes only after a graphic comparison or a written skip for this brief', async t => {
  const { realpathSync } = await import('node:fs');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { requireGraphicDecision } = await import('../core/design/new-surface-advisories.ts');
  const { graphicDecision } = await import('../core/design/taste-graphic-decision.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const brief = 'b'.repeat(64);
  const publish = (taskNeed: string) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-graphic-decision-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const request = 'Build a landing page for this project.';
    const { invocation, writer } = createModelLedRouteContext(root, request);
    const input = modelLedInput(request);
    (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
    publishAdaptiveRoute(root, input, writer, invocation);
    return { root, route: readPersistedRoute(root, invocation) };
  };
  const landing = publish('new-marketing');
  assert.throws(() => requireGraphicDecision(landing.root, landing.route, brief), /GRAPHIC_DECISION_MISSING: .*omd taste graphic --skip/);
  mkdirSync(join(landing.root, '.omd/taste/graphics'), { recursive: true });
  const skip = join(landing.root, '.omd/taste/graphics/skip-1.json');
  writeFileSync(skip, JSON.stringify({ schema: 'omd-taste-graphic-skip-v1', briefSha256: 'a'.repeat(64), reason: 'Another brief.' }));
  assert.throws(() => requireGraphicDecision(landing.root, landing.route, brief), /GRAPHIC_DECISION_MISSING/);
  writeFileSync(skip, JSON.stringify({ schema: 'omd-taste-graphic-skip-v1', briefSha256: brief, reason: 'The real product capture is the only picture.' }));
  assert.equal(graphicDecision(landing.root, brief), 'skipped');
  assert.doesNotThrow(() => requireGraphicDecision(landing.root, landing.route, brief));
  const round = (n: number, verdict: string) => writeFileSync(join(landing.root, `.omd/taste/graphics/r${n}.json`),
    JSON.stringify({ schema: 'omd-taste-graphic-review-v1', briefSha256: brief, graphic: { path: 'public/graphics/hero.png' }, summary: { verdict } }));
  rmSync(skip);
  round(1, 'distinguishable');
  assert.equal(graphicDecision(landing.root, brief), null, 'one losing comparison is a repair signal, not a pass');
  round(2, 'distinguishable'); round(3, 'distinguishable');
  assert.equal(graphicDecision(landing.root, brief), 'compared', 'three rounds of rework settle it');
  for (const n of [2, 3]) rmSync(join(landing.root, `.omd/taste/graphics/r${n}.json`));
  round(4, 'not-distinguishable');
  assert.equal(graphicDecision(landing.root, brief), 'compared');
  const product = publish('new-product');
  assert.doesNotThrow(() => requireGraphicDecision(product.root, product.route, brief));
});

test('stage next points a new landing at section graphics after references, until a comparison or skip exists', async t => {
  const { realpathSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { nextStageWork } = await import('../core/stage/next.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-graphic-stage-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  publishAdaptiveRoute(root, input, writer, invocation);
  const packRoot = fileURLToPath(new URL('../core', import.meta.url));
  mkdirSync(join(root, '.omd'), { recursive: true });
  writeFileSync(join(root, '.omd/brief.json'), JSON.stringify(TEST_BRIEF));
  const session = join(root, '.omd/discovery/browse/s1');
  mkdirSync(session, { recursive: true });
  writeFileSync(join(session, 'trace.jsonl'), `${JSON.stringify({ action: { provider: 'cosmos', query: 'x', verb: 'search' } })}\n`);
  mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
  writeFileSync(join(root, '.omd/refs/design/kept.json'), JSON.stringify({ source: 'https://cosmos.so/e/1', sourceUrl: 'https://cosmos.so/e/1',
    component: 'hero', kind: 'image', imagePath: '.omd/refs/design/kept.png', researchLane: 'design' }));
  writeFileSync(join(root, '.omd/reference-direction-admission.json'), '{}');
  // The section graphics are designed before the page around them.
  const work = nextStageWork(root, packRoot, invocation);
  assert.equal(work.stage, 'graphics', JSON.stringify(work));
  assert.match(work.instruction, /omd taste graphic/);
  mkdirSync(join(root, '.omd/taste/graphics'), { recursive: true });
  writeFileSync(join(root, '.omd/taste/graphics/skip-1.json'), JSON.stringify({ schema: 'omd-taste-graphic-skip-v1',
    briefSha256: invocation.current.briefSha256, reason: 'The real product capture is the only picture.' }));
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'compose-first-render');
});

test('a model-led route refuses a design capture picked from memory even though discovery is recorded as skipped', async t => {
  const { realpathSync } = await import('node:fs');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { captureLane } = await import('../core/ref/capture-intake.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-memory-pick-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  publishAdaptiveRoute(root, input, writer, invocation);
  assert.equal(readPersistedRoute(root, invocation).references.decision, 'skip');
  assert.throws(() => captureLane(root, { source: 'https://www.raycast.com', lane: 'design' }, invocation), /DESIGN_REFERENCE_UNSEARCHED/);
  assert.equal(captureLane(root, { source: 'http://127.0.0.1:4173/', lane: 'design' }, invocation), 'design');
  assert.equal(captureLane(root, { source: 'https://www.raycast.com', lane: 'domain' }, invocation), 'domain');
});

test('a new landing with no observed motion finishes only once the blind page comparison passes it', async t => {
  const { realpathSync } = await import('node:fs');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { requireNoticeableMotion } = await import('../core/design/new-surface-advisories.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const publish = (taskNeed: string) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-motion-gate-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const request = 'Build a landing page for this project.';
    const { invocation, writer } = createModelLedRouteContext(root, request);
    const input = modelLedInput(request);
    (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
    publishAdaptiveRoute(root, input, writer, invocation);
    return { root, route: readPersistedRoute(root, invocation) };
  };
  const still = { load: { tracks: [] }, scroll: { triggered: [], scrubbed: [], pinned: [] } };
  const entryOnly = { load: { tracks: [{}, {}] }, scroll: { triggered: [], scrubbed: [], pinned: [{}] } };
  const moving = { load: { tracks: [{}] }, scroll: { triggered: [{}, {}], scrubbed: [{}], pinned: [] } };
  const verdict = (value: string) => async () => ({ summary: { verdict: value, judgedAi: 0, trials: 8 } });
  const landing = publish('new-marketing'), brief = 'b'.repeat(64);
  await assert.rejects(requireNoticeableMotion(landing.root, landing.route, still, brief, async () => undefined), /MOTION_ABSENT: .*theory\/motion\.md/);
  await assert.rejects(requireNoticeableMotion(landing.root, landing.route, still, brief, verdict('distinguishable')), /MOTION_ABSENT/);
  await requireNoticeableMotion(landing.root, landing.route, still, brief, verdict('not-distinguishable'));
  await assert.rejects(requireNoticeableMotion(landing.root, landing.route, entryOnly, brief, async () => undefined),
    /MOTION_ABSENT: the rendered page moves only on load; .*at least 3/);
  await requireNoticeableMotion(landing.root, landing.route, moving, brief, async () => undefined);
  const product = publish('existing-product-change');
  await requireNoticeableMotion(product.root, product.route, still, brief, async () => undefined);
});

test('a new surface cites both a finished site and a gallery shot; kinds, not a count', async t => {
  const { realpathSync } = await import('node:fs');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { requireReferenceKinds } = await import('../core/design/new-surface-advisories.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const publish = (taskNeed: string) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-reference-kinds-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const request = 'Build a landing page for this project.';
    const { invocation, writer } = createModelLedRouteContext(root, request);
    const input = modelLedInput(request);
    (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
    publishAdaptiveRoute(root, input, writer, invocation);
    return readPersistedRoute(root, invocation);
  };
  const landing = publish('new-marketing');
  const site = { sourceUrl: 'https://openscreenshot.app/?ref=onepagelove' };
  const shot = { sourceUrl: 'https://dribbble.com/shots/27331769-Landing' };
  assert.throws(() => requireReferenceKinds(landing, [site]), /COMPONENT_REFERENCES_MISSING: .*lack a UI or graphic shot/);
  assert.throws(() => requireReferenceKinds(landing, [shot]), /lack a finished site/);
  requireReferenceKinds(landing, [site, shot]);
  requireReferenceKinds(publish('existing-product-change'), [site]);
});

test('the compose step names the copy, layout and motion knowledge for a landing, and Korean type for Korean text', async () => {
  const { composeGuidance } = await import('../core/design/compose-guidance.ts');
  const route = (taskNeed: string, request: string, projectMode = 'greenfield') => ({ request, projectMode,
    sourceContract: { referenceDiscovery: { taskNeed } } }) as unknown as Parameters<typeof composeGuidance>[0];
  const landing = composeGuidance(route('new-marketing', '이 프로젝트를 소개하는 랜딩 페이지 만들어줘'));
  for (const pack of ['omd scaffold', 'theory/web-copy.md', 'theory/voice.md', 'theory/layout.md', 'composition/typographic-hero.md', 'theory/typography-korean.md']) {
    assert.ok(landing.includes(pack), pack);
  }
  const product = composeGuidance(route('existing-product-change', 'Add a settings page', 'existing'));
  assert.ok(product.includes('theory/ux.md') && !product.includes('omd scaffold') && !product.includes('typography-korean'));
});

test('a new surface\'s primary waits for the isolated direction review', async t => {
  const { realpathSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { publishAdaptiveRoute } = await import('../core/route/adaptive-route-persistence.ts');
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { requireReviewedPrimary } = await import('../core/design/new-surface-advisories.ts');
  const { createModelLedRouteContext, modelLedInput } = await import('./helpers/model-led.ts');
  const publish = (taskNeed: string) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-reviewed-primary-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const request = 'Build a landing page for this project.';
    const { invocation, writer } = createModelLedRouteContext(root, request);
    const input = modelLedInput(request);
    (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
    publishAdaptiveRoute(root, input, writer, invocation);
    mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
    const png = Buffer.from('fake png bytes');
    writeFileSync(join(root, '.omd/refs/design/site.png'), png);
    writeFileSync(join(root, '.omd/refs/design/site.json'), JSON.stringify({ source: 'https://siter.io/', sourceUrl: 'https://siter.io/',
      component: 'page', kind: 'image', imagePath: '.omd/refs/design/site.png', researchLane: 'design' }));
    return { root, route: readPersistedRoute(root, invocation), sha256: createHash('sha256').update(png).digest('hex') };
  };
  const landing = publish('new-marketing');
  assert.throws(() => requireReviewedPrimary(landing.root, landing.route, [{ sha256: landing.sha256, role: 'primary' }]),
    /PRIMARY_NOT_REVIEWED: run omd ref direction-review/);
  const product = publish('existing-product-change');
  requireReviewedPrimary(product.root, product.route, [{ sha256: product.sha256, role: 'primary' }]);
});
