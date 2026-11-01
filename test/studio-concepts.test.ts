import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { classifyPiWrite } from '../extensions/omd-guard.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const project = (t: { after: (fn: () => void) => void }, taskNeed: string) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-studio-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
  publishAdaptiveRoute(root, input, writer, invocation);
  return { root, invocation, writer, route: readPersistedRoute(root, invocation) };
};
const sketch = (root: string, name: string, body: string) => {
  mkdirSync(join(root, '.omd/studio/concepts', name), { recursive: true });
  writeFileSync(join(root, '.omd/studio/concepts', name, 'index.html'), `<!doctype html><body>${body}</body>`);
};
// Stands in for the browser: the capture's bytes follow the sketch, so an edited sketch is a different render.
const fakeRender = (root: string) => async (page: string, viewport: { width: number }, out: string) => {
  mkdirSync(join(root, '.omd/studio/renders'), { recursive: true });
  writeFileSync(join(root, out), `${viewport.width}:${readFileSync(page, 'utf8')}`);
};

test('a new surface renders three concepts before its first render; stage next asks for them first', async t => {
  const { requireStudioConcepts, renderStudioConcepts, currentStudioConcepts } = await import('../core/design/studio.ts');
  const { nextStageWork } = await import('../core/stage/next.ts');
  const packRoot = fileURLToPath(new URL('../core', import.meta.url));
  const { root, invocation, writer, route } = project(t, 'new-marketing');
  assert.throws(() => requireStudioConcepts(root, route), /STUDIO_CONCEPTS_MISSING: .*omd studio concepts --json/);
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'render-studio-concepts');
  sketch(root, 'atelier', 'a room the visitor walks through');
  sketch(root, 'journey', 'a route from request to page');
  // Two sketches are not a choice; rendering refuses and writes nothing.
  await assert.rejects(renderStudioConcepts(root, writer, fakeRender(root)), /STUDIO_CONCEPTS_MISSING: found 2 concept sketches/);
  sketch(root, 'specimen', 'one page held up like a type specimen');
  const rendered = await renderStudioConcepts(root, writer, fakeRender(root));
  assert.deepEqual(rendered.concepts.map(concept => concept.name), ['atelier', 'journey', 'specimen']);
  assert.ok(rendered.concepts.every(concept => concept.captures.map(capture => capture.viewport).join() === 'desktop,mobile'));
  requireStudioConcepts(root, route);
  assert.notEqual(nextStageWork(root, packRoot, invocation).action, 'render-studio-concepts');
  // Editing a sketch after rendering makes its render stale until it is rendered again.
  sketch(root, 'journey', 'a different route');
  assert.equal(currentStudioConcepts(root).length, 2);
  assert.throws(() => requireStudioConcepts(root, route), /STUDIO_CONCEPTS_MISSING/);
});

test('an existing-project route never waits for concepts', async t => {
  const { requireStudioConcepts } = await import('../core/design/studio.ts');
  const { root, route } = project(t, 'existing-product-change');
  requireStudioConcepts(root, route);
});

test('concept sketches and studio notes are authored directly; their renders and record are CLI-owned', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-studio-write-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(classifyPiWrite(root, '.omd/studio/concepts/atelier/index.html').kind, 'authoring');
  assert.equal(classifyPiWrite(root, '.omd/studio/copy.md').kind, 'authoring');
  assert.equal(classifyPiWrite(root, '.omd/studio/concepts.json').kind, 'blocked');
  assert.equal(classifyPiWrite(root, '.omd/studio/renders/atelier-desktop.png').kind, 'blocked');
});
