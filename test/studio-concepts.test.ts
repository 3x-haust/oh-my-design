import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { classifyPiWrite } from '../extensions/omd-guard.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const fixtureCli = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
const fixtureHost = {
  nodePath: realpathSync(process.execPath), nodeSha256: hash(readFileSync(process.execPath)),
  cliPath: fixtureCli, cliSha256: hash(readFileSync(fixtureCli)),
  provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'studio-parent',
};

const project = (t: { after: (fn: () => void) => void }, taskNeed: string) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-studio-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request, { host: fixtureHost });
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = taskNeed;
  publishAdaptiveRoute(root, input, writer, invocation);
  return { root, invocation, writer, route: readPersistedRoute(root, invocation) };
};
const sketch = (root: string, name: string, body: string) => {
  mkdirSync(join(root, '.omd/studio/concepts', name), { recursive: true });
  writeFileSync(join(root, '.omd/studio/concepts', name, 'index.html'), `<!doctype html><body>${body}</body>`);
};
// A one-pixel PNG whose colour follows the sketch, so an edited sketch is a different render.
const png = (seed: string): Buffer => {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const rgb = Buffer.from(hash(seed).slice(0, 6), 'hex');
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat([Buffer.from([0]), rgb]))), chunk('IEND', Buffer.alloc(0))]);
};
// Stands in for the browser; the folder must already exist, as it must for the real screenshot writer.
const fakeRender = (root: string) => async (page: string, viewport: { width: number }, out: string) => {
  writeFileSync(join(root, out), png(`${viewport.width}:${readFileSync(page, 'utf8')}`));
};
async function anchorServer(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><body style="margin:0;background:#f4efe6;font:20px Georgia"><h1 style="font-size:72px;padding:48px">Quiet tools</h1></body>');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>(done => server.close(() => done())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('a new surface renders three concepts and picks one blind before its first render', { timeout: 240_000 }, async t => {
  const { renderStudioConcepts, currentStudioConcepts } = await import('../core/design/studio.ts');
  const { requireStudioPick, runStudioPick, currentStudioPick } = await import('../core/design/studio-pick.ts');
  const { nextStageWork } = await import('../core/stage/next.ts');
  const packRoot = fileURLToPath(new URL('../core', import.meta.url));
  const { root, invocation, writer, route } = project(t, 'new-marketing');
  assert.throws(() => requireStudioPick(root, route), /STUDIO_CONCEPTS_MISSING: .*omd studio concepts --json/);
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'render-studio-concepts');
  sketch(root, 'atelier', 'a room the visitor walks through');
  sketch(root, 'journey', 'a route from request to page');
  // Two sketches are not a choice; rendering refuses and writes nothing.
  await assert.rejects(renderStudioConcepts(root, writer, fakeRender(root)), /STUDIO_CONCEPTS_MISSING: found 2 concept sketches/);
  sketch(root, 'specimen', 'one page held up like a type specimen');
  const rendered = await renderStudioConcepts(root, writer, fakeRender(root));
  assert.deepEqual(rendered.concepts.map(concept => concept.name), ['atelier', 'journey', 'specimen']);
  assert.ok(rendered.concepts.every(concept => concept.captures.map(capture => capture.viewport).join() === 'desktop,mobile'));
  // Rendered but not yet picked: the page still waits, and stage next asks for the blind pick.
  assert.throws(() => requireStudioPick(root, route), /STUDIO_PICK_MISSING: .*omd studio pick --json/);
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'pick-studio-concept');

  const origin = await anchorServer(t);
  const journey = rendered.concepts.find(concept => concept.name === 'journey')!.captures[0]!.sha256;
  const previous = process.env.PI_REVIEWER_FIXTURE_HUMAN_SHAS;
  process.env.PI_REVIEWER_FIXTURE_HUMAN_SHAS = journey;
  t.after(() => { if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_HUMAN_SHAS; else process.env.PI_REVIEWER_FIXTURE_HUMAN_SHAS = previous; });
  const picked = await runStudioPick(root, invocation, { anchors: [`${origin}/a`], signal: t.signal });
  // journey was taken for the human page in both orders; the others were only read by slot, which says nothing.
  assert.equal(picked.picked, 'journey');
  assert.deepEqual(picked.concepts.map(concept => [concept.name, concept.judgedAi, concept.trials, concept.rate]),
    [['journey', 0, 2, 0], ['atelier', 1, 2, 1], ['specimen', 1, 2, 1]]);
  assert.match(picked.next, /^Build journey: judged AI-made in 0 of 2 blind trials \(next: atelier/);
  assert.equal(currentStudioPick(root)?.picked, 'journey');
  requireStudioPick(root, route);
  assert.notEqual(nextStageWork(root, packRoot, invocation).stage, 'concepts');

  // Editing a sketch after the pick makes its render and the pick stale until both are redone.
  sketch(root, 'journey', 'a different route');
  assert.equal(currentStudioConcepts(root).length, 2);
  assert.equal(currentStudioPick(root), null);
  assert.throws(() => requireStudioPick(root, route), /STUDIO_CONCEPTS_MISSING/);
  await renderStudioConcepts(root, writer, fakeRender(root));
  assert.throws(() => requireStudioPick(root, route), /STUDIO_PICK_MISSING/);
  // A hand-edited record loses its signature.
  sketch(root, 'journey', 'a route from request to page');
  await renderStudioConcepts(root, writer, fakeRender(root));
  const record = JSON.parse(readFileSync(join(root, '.omd/studio/pick.json'), 'utf8'));
  writeFileSync(join(root, '.omd/studio/pick.json'), JSON.stringify({ ...record, picked: 'specimen' }));
  assert.equal(currentStudioPick(root), null);
});

test('an existing-project route never waits for concepts or a pick', async t => {
  const { requireStudioPick } = await import('../core/design/studio-pick.ts');
  const { root, route } = project(t, 'existing-product-change');
  requireStudioPick(root, route);
});

test('concept sketches and studio notes are authored directly; their renders and records are CLI-owned', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-studio-write-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(classifyPiWrite(root, '.omd/studio/concepts/atelier/index.html').kind, 'authoring');
  assert.equal(classifyPiWrite(root, '.omd/studio/copy.md').kind, 'authoring');
  assert.equal(classifyPiWrite(root, '.omd/studio/concepts.json').kind, 'blocked');
  assert.equal(classifyPiWrite(root, '.omd/studio/pick.json').kind, 'blocked');
  assert.equal(classifyPiWrite(root, '.omd/studio/renders/atelier-desktop.png').kind, 'blocked');
});
