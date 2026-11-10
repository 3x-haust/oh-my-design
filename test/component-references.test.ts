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

test('the compose step names the copy, layout and motion knowledge for a landing, and Korean type for Korean text', async () => {
  const { composeGuidance } = await import('../core/design/compose-guidance.ts');
  const route = (taskNeed: string, request: string, projectMode = 'greenfield') => ({ request, projectMode,
    sourceContract: { referenceDiscovery: { taskNeed } } }) as unknown as Parameters<typeof composeGuidance>[0];
  // A landing built to a Figma target is not a studio page; it still gets the copy, layout and composition knowledge.
  const landing = composeGuidance(route('new-marketing', '이 피그마대로 랜딩 페이지 만들어줘 https://www.figma.com/design/AbC123/Site?node-id=1-2'));
  for (const pack of ['guides/code.md', 'theory/web-copy.md', 'theory/voice.md', 'theory/layout.md', 'composition/typographic-hero.md', 'theory/typography-korean.md']) {
    assert.ok(landing.includes(pack), pack);
  }
  // A new page builds its picked concept and goes to finish; no hero-only review round, no composition catalogue.
  const studio = composeGuidance(route('new-marketing', '이 프로젝트를 소개하는 랜딩 페이지 만들어줘'));
  assert.ok(studio.includes('guides/code.md') && !studio.includes('omd scaffold') && studio.includes('system.json') && studio.includes('omd lifecycle finish'));
  assert.ok(!studio.includes('composition/') && !studio.includes('first-render check') && studio.includes('typography-korean'));
  const product = composeGuidance(route('existing-product-change', 'Add a settings page', 'existing'));
  assert.ok(product.includes('theory/ux.md') && !product.includes('guides/code.md') && !product.includes('typography-korean'));
});
