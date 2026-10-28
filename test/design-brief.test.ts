import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DESIGN_BRIEF_SKELETON, parseDesignBrief, publishDesignBrief, readDesignBrief } from '../core/design/design-brief.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const brief = {
  schema: 'design-brief-v1',
  audience: 'Developers who already use a coding agent and have seen its generic pages.',
  personas: [{ name: 'Minji, frontend lead', context: 'Desktop, between reviews, judging a tool in a minute', job: 'Decide whether OMD fixes generic agent pages',
    mustBelieveIn5s: 'The same request produces a page a designer would sign', dealBreaker: 'Claims without a before and after' }],
  visitorQuestions: ['What is it?', 'Does it really design better?', 'How do I start?'],
  message: 'Your coding agent designs like a designer, not like a template.',
  sections: [
    { name: 'hero', question: 'What is it?', says: 'One skill that makes the agent look before it builds.', shows: 'The OMD mark lit as the hero object.' },
    { name: 'proof', question: 'Does it really design better?', says: 'Same request, two results.', shows: 'The bakery page before and after, large.' },
    { name: 'install', question: 'How do I start?', says: 'Install and run one command.', shows: 'The install command.' },
  ],
  cut: [{ what: 'The internal review loop and its stages', why: 'Visitors need the result, not the pipeline.' }],
  concept: { source: 'The OMD mark: a square body with black-edged handles', idea: 'The mark becomes the handle that lifts a page out of the template', typeAndGraphic: 'The headline wraps the mark' },
  directions: { options: ['The mark as a selection handle that lifts a page out of the template',
    'A split screen where the same request becomes two pages', 'A terminal that renders the page it describes'],
    chosen: 'The mark as a selection handle that lifts a page out of the template', why: 'Only OMD owns the handle; the others fit any AI builder.' },
  onlyThisProduct: 'The square body with handles selecting the hero line; no other harness has that mark.',
  heroProof: { mode: 'real-output', shows: 'The bakery page OMD produced from a one-line request, beside the generic one.',
    because: 'Minji believes a result she can see, not a promise.' },
  decisions: {
    ground: { choice: 'white', because: 'The brand kit shows the mark on white; the oven-light orange needs a neutral ground.' },
    accent: { choice: '#ff4a1c', because: 'The oven-light gradient of the OMD mark.' },
    type: { choice: 'Geist display with Pretendard body', because: 'The lockup is set in Geist SemiBold; Korean body needs Pretendard.' },
    layout: { choice: 'one large statement per screen', because: 'Three visitor questions, each answered by one claim and one graphic.' },
  },
  motion: 'The before page lifts into the after page as the visitor scrolls.',
  voice: 'Plain, confident 합니다체.',
};

test('a brief names the visitor, one message, a section per question, its cuts and a concept', () => {
  assert.equal(parseDesignBrief(brief).sections.length, 3);
  assert.throws(() => parseDesignBrief(DESIGN_BRIEF_SKELETON), /placeholder/);
  assert.throws(() => parseDesignBrief({ ...brief, cut: [] }), /cut must list/);
  assert.throws(() => parseDesignBrief({ ...brief, sections: [...brief.sections, { name: 'loop', question: 'How does the loop work?', says: 'x', shows: 'y' }] }),
    /sections\[3\]\.question must repeat one of visitorQuestions/);
  assert.throws(() => parseDesignBrief({ ...brief, sections: undefined }), /sections must list/);
  assert.throws(() => parseDesignBrief({ ...brief, extra: true }), /unknown keys: extra/);
  // Go wide, then choose; and every visual decision names where it comes from.
  assert.throws(() => parseDesignBrief({ ...brief, directions: { ...brief.directions, options: brief.directions.options.slice(0, 2) } }), /three or more distinct/);
  assert.throws(() => parseDesignBrief({ ...brief, directions: { ...brief.directions, chosen: 'Something else' } }), /chosen must repeat/);
  for (const because of ['모던하고 깔끔하게', 'clean, modern and minimal']) {
    assert.throws(() => parseDesignBrief({ ...brief, decisions: { ...brief.decisions, accent: { choice: '#16a34a', because } } }), /chooses nothing/);
  }
  assert.throws(() => parseDesignBrief({ ...brief, sections: [brief.sections[0], { ...brief.sections[1], name: 'HERO' }] }), /name must be distinct/);
  // Named visitors with a job, at most three; the hero's proof is one of the named modes.
  assert.throws(() => parseDesignBrief({ ...brief, personas: [] }), /personas must list/);
  assert.throws(() => parseDesignBrief({ ...brief, personas: Array(4).fill(brief.personas[0]) }), /one to three/);
  assert.throws(() => parseDesignBrief({ ...brief, personas: [{ ...brief.personas[0], dealBreaker: '' }] }), /personas\[0\]\.dealBreaker/);
  assert.throws(() => parseDesignBrief({ ...brief, heroProof: { ...brief.heroProof, mode: 'stock-photo' } }), /heroProof\.mode must be one of/);
  assert.equal(parseDesignBrief({ ...brief, heroProof: { ...brief.heroProof, mode: 'working-product' } }).heroProof.mode, 'working-product');
});

test('a new surface needs its brief before the first render, and stage next asks for it first', async t => {
  const { requireDesignBrief } = await import('../core/design/new-surface-advisories.ts');
  const { nextStageWork } = await import('../core/stage/next.ts');
  const { fileURLToPath } = await import('node:url');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-design-brief-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  publishAdaptiveRoute(root, input, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  const packRoot = fileURLToPath(new URL('../core', import.meta.url));
  assert.throws(() => requireDesignBrief(root, route), /DESIGN_BRIEF_MISSING: .*omd brief --input/);
  assert.equal(nextStageWork(root, packRoot, invocation).stage, 'brief');
  publishDesignBrief(brief, writer);
  assert.equal(readDesignBrief(root)?.message, brief.message);
  requireDesignBrief(root, route);
  assert.equal(nextStageWork(root, packRoot, invocation).stage, 'references');
});

test('a new surface publishes its references before the first render', async t => {
  const { requireConsultedReferences } = await import('../core/design/new-surface-advisories.ts');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-consulted-first-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  publishAdaptiveRoute(root, input, writer, invocation);
  assert.throws(() => requireConsultedReferences(root, readPersistedRoute(root, invocation)), /CONSULTED_REFERENCES_MISSING: .*omd ref context/);
  const existing = realpathSync(mkdtempSync(join(tmpdir(), 'omd-consulted-existing-')));
  t.after(() => rmSync(existing, { recursive: true, force: true }));
  const context = createModelLedRouteContext(existing, request);
  const product = modelLedInput(request);
  (product.referenceDiscovery as Record<string, unknown>).taskNeed = 'existing-product-change';
  publishAdaptiveRoute(existing, product, context.writer, context.invocation);
  requireConsultedReferences(existing, readPersistedRoute(existing, context.invocation));
});

test('every brief section has references cited under its name; coverage follows the plan, not a number', async t => {
  const { requireSectionReferences } = await import('../core/design/new-surface-advisories.ts');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-section-refs-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  publishAdaptiveRoute(root, input, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  publishDesignBrief(brief, writer);
  const cited = [{ role: 'primary', component: 'page', sourceUrl: 'https://siter.io/' },
    { role: 'supplemental', component: 'hero', sourceUrl: 'https://dribbble.com/shots/1' },
    { role: 'supplemental', component: 'Proof', sourceUrl: 'https://coding.bio/' }];
  assert.throws(() => requireSectionReferences(root, route, cited), /SECTION_REFERENCES_MISSING: .*"install"/);
  // Another screen of the primary site does not count for a section.
  assert.throws(() => requireSectionReferences(root, route, [...cited, { role: 'supplemental', component: 'install', sourceUrl: 'https://www.siter.io/#start' }]),
    /"install"/);
  requireSectionReferences(root, route, [...cited, { role: 'supplemental', component: 'install', sourceUrl: 'https://cactuscoding.com/' }]);
  // One site's pages are one look: it stands for one section, while each gallery work is its own source.
  assert.throws(() => requireSectionReferences(root, route, [...cited, { role: 'supplemental', component: 'install', sourceUrl: 'https://coding.bio/docs#install' }]),
    /"install"[\s\S]*no other section already cites/);
  requireSectionReferences(root, route, [...cited.slice(0, 2), { role: 'supplemental', component: 'Proof', sourceUrl: 'https://dribbble.com/shots/2' },
    { role: 'supplemental', component: 'install', sourceUrl: 'https://dribbble.com/shots/3' }]);
  // Two works kept from one gallery results page share its address; their pixels tell them apart.
  const results = 'https://www.cosmos.so/search/elements/terminal';
  requireSectionReferences(root, route, [...cited.slice(0, 2), { role: 'supplemental', component: 'Proof', sourceUrl: results, sha256: 'a'.repeat(64) },
    { role: 'supplemental', component: 'install', sourceUrl: results, sha256: 'b'.repeat(64) }]);
  // Dropping the section that lacks references is refused unless the cut says why the visitor does not need it.
  const withoutInstall = { ...brief, sections: brief.sections.filter(section => section.name !== 'install') };
  assert.throws(() => publishDesignBrief(withoutInstall, writer, root), /"install" left the brief without a cut entry/);
  assert.equal(readDesignBrief(root)?.sections.length, 3, 'the refused brief left the published one in place');
  publishDesignBrief({ ...withoutInstall, cut: [...brief.cut, { what: 'The install section', why: 'The hero button already copies the command.' }] }, writer, root);
  assert.equal(readDesignBrief(root)?.sections.length, 2);
});

test('a new landing renders a section graphic before its first render', async t => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { requireGraphicsStarted } = await import('../core/design/new-surface-advisories.ts');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-graphics-first-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  publishAdaptiveRoute(root, input, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  assert.throws(() => requireGraphicsStarted(root, route), /GRAPHICS_NOT_STARTED: .*omd render --graphic/);
  mkdirSync(join(root, '.omd/graphics/renders'), { recursive: true });
  // A page holding a placed (or broken) image rendered through --graphic is not a built scene.
  writeFileSync(join(root, '.omd/graphics/renders/a.json'), JSON.stringify({ schema: 'graphic-render-v1', path: 'public/graphics/result.png',
    largestRaster: { src: 'before-after.png', share: 0.22 }, webglShare: 0, loadedRasters: [] }));
  assert.throws(() => requireGraphicsStarted(root, route), /result\.png\) hold no built scene/);
  // Nor is a 3D card carrying a screenshot as its texture.
  writeFileSync(join(root, '.omd/graphics/renders/b.json'), JSON.stringify({ schema: 'graphic-render-v1', path: 'public/graphics/card.png',
    largestRaster: null, webglShare: 0.9, loadedRasters: ['screenshot.png'] }));
  assert.throws(() => requireGraphicsStarted(root, route), /GRAPHICS_NOT_STARTED/);
  writeFileSync(join(root, '.omd/graphics/renders/c.json'), JSON.stringify({ schema: 'graphic-render-v1', path: 'public/graphics/mark.png',
    largestRaster: null, webglShare: 0.8, loadedRasters: [] }));
  requireGraphicsStarted(root, route);
  // The page's own source waits until that graphic is settled: one lost comparison means it is still being designed.
  const { requireGraphicSettled } = await import('../core/design/new-surface-advisories.ts');
  mkdirSync(join(root, '.omd/taste/graphics'), { recursive: true });
  const compared = (name: string, verdict: string) => writeFileSync(join(root, `.omd/taste/graphics/${name}.json`), JSON.stringify({
    schema: 'omd-taste-graphic-review-v1', graphic: { path: 'public/graphics/mark.png' }, summary: { verdict } }));
  compared('r1', 'distinguishable');
  assert.throws(() => requireGraphicSettled(root, route), /GRAPHIC_NOT_SETTLED/);
  compared('r2', 'not-distinguishable');
  requireGraphicSettled(root, route);
});

test('before a graphic is rendered only the page source waits; the graphics and the setup stay writable', async () => {
  const { pageSourcePath } = await import('../core/design/new-surface-advisories.ts');
  for (const path of ['src/App.tsx', './src/components/Hero.tsx', 'src/index.css', 'index.html']) assert.equal(pageSourcePath(path), true, path);
  for (const path of ['public/graphics/hero.html', 'src/graphics/mark.ts', 'package.json', 'public/fonts/Pretendard.woff2', '.omd/.cache/brief.json'])
    assert.equal(pageSourcePath(path), false, path);
});

test('a new landing drafts its sections as page ideas before its own source is written', async t => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { requirePageIdeas } = await import('../core/design/new-surface-advisories.ts');
  const landing = (taskNeed: string) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-page-ideas-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const request = 'Build a landing page for this project.';
    const { invocation, writer } = createModelLedRouteContext(root, request);
    const input = modelLedInput(request);
    (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
    publishAdaptiveRoute(root, input, writer, invocation);
    mkdirSync(join(root, '.omd/ideas'), { recursive: true });
    return { root, route: readPersistedRoute(root, invocation) };
  };
  const { root, route } = landing('new-marketing');
  assert.throws(() => requirePageIdeas(root, route), /PAGE_IDEAS_MISSING: .*omd imagegen --kind page --name <section>/);
  // A graphic idea settles one object, not the composition of the page around it.
  writeFileSync(join(root, '.omd/ideas/review-1.png'), 'png');
  writeFileSync(join(root, '.omd/ideas/review-1.json'), JSON.stringify({ prompt: 'a lifted page', references: [] }));
  assert.throws(() => requirePageIdeas(root, route), /PAGE_IDEAS_MISSING/);
  writeFileSync(join(root, '.omd/ideas/hero-1.png'), 'png');
  writeFileSync(join(root, '.omd/ideas/hero-1.json'), JSON.stringify({ prompt: 'hero composition', kind: 'page', references: [] }));
  requirePageIdeas(root, route);
  // Where image generation is unavailable, the attempt on record is enough and the page is drafted in code.
  const unavailable = landing('new-marketing');
  writeFileSync(join(unavailable.root, '.omd/ideas/unavailable.json'), JSON.stringify({ reason: 'IDEA_IMAGE_UNAVAILABLE' }));
  requirePageIdeas(unavailable.root, unavailable.route);
  // A product screen is not drafted this way by default.
  const product = landing('new-product');
  requirePageIdeas(product.root, product.route);
});
