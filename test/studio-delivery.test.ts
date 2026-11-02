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
import { runModelLedCompletion } from '../bin/model-led-completion-command.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { renderStudioConcepts } from '../core/design/studio.ts';
import { runStudioPick } from '../core/design/studio-pick.ts';
import { stallMessage } from '../core/design/first-render-loop-state.ts';
import { currentStudioDelivery, requireStudioDelivery, STUDIO_REVIEW_ROUNDS } from '../core/design/studio-delivery.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const packRoot = fileURLToPath(new URL('../core', import.meta.url));
const fixtureCli = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
const fixtureHost = {
  nodePath: realpathSync(process.execPath), nodeSha256: hash(readFileSync(process.execPath)),
  cliPath: fixtureCli, cliSha256: hash(readFileSync(fixtureCli)),
  provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'delivery-parent',
};
const sketch = (root: string, name: string, body: string) => {
  mkdirSync(join(root, '.omd/studio/concepts', name), { recursive: true });
  writeFileSync(join(root, '.omd/studio/concepts', name, 'index.html'), `<!doctype html><body>${body}</body>`);
};
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
const fixture = (t: { after: (fn: () => void) => void }, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
};

test('a new page is delivered after its review rounds with the open findings named, and never on changed source', { timeout: 300_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-studio-delivery-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request, { host: fixtureHost });
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  input.allowedPaths = ['index.html'];
  publishAdaptiveRoute(root, input, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  sketch(root, 'atelier', 'a room the visitor walks through');
  sketch(root, 'journey', 'a route from request to page');
  sketch(root, 'specimen', 'one page held up like a type specimen');
  await renderStudioConcepts(root, writer, fakeRender(root));
  await runStudioPick(root, invocation, { anchors: [`${await anchorServer(t)}/a`], signal: t.signal });
  const page = (round: number) => `<!doctype html><html><body style="font:18px Arial;margin:24px"><main><h1>Quiet tools</h1>
    <p>Round ${round}</p><a href="#start">Start</a></main></body></html>`;
  writeFileSync(join(root, 'index.html'), page(1));

  // Building the pick is the work, and finish is how it is checked; nothing asks a new page for a browser plan.
  const first = nextStageWork(root, packRoot, invocation);
  assert.equal(first.action, 'compose-first-render');
  assert.match(first.instruction, /picked concept.*omd lifecycle finish --json/);
  assert.throws(() => requireStudioDelivery(root, route), /STUDIO_DELIVERY_REQUIRED/);

  fixture(t, { PI_REVIEWER_FIXTURE_MODE: 'early-revise', PI_REVIEWER_FIXTURE_FINDING_ID: 'hero-crowded' });
  const round1 = await runModelLedCompletion({ root, packRoot, invocation, signal: t.signal });
  assert.equal(round1.ok, false);
  assert.equal(round1.diagnostic?.code, 'FIRST_RENDER_VISUAL_REPAIR');
  assert.match(round1.diagnostic?.message ?? '', /Review round 1 of 3/);
  assert.equal(round1.diagnostic?.next, 'omd lifecycle finish --json');
  assert.equal(currentStudioDelivery(root, route), null);
  const second = nextStageWork(root, packRoot, invocation);
  assert.equal(second.action, 'finish-model-led');
  assert.match(second.instruction, new RegExp(`Review round 2 of ${STUDIO_REVIEW_ROUNDS}`));

  for (const round of [2, 3]) {
    writeFileSync(join(root, 'index.html'), page(round));
    process.env.PI_REVIEWER_FIXTURE_MODE = 'early-progress-improved';
    process.env.PI_REVIEWER_FIXTURE_FINDING_ID = `finding-${round}`;
    const result = await runModelLedCompletion({ root, packRoot, invocation, signal: t.signal });
    if (round === 2) assert.match(result.diagnostic?.message ?? '', /Review round 2 of 3/);
    else {
      // The third round is spent and is the best: the page ships, naming what is still open.
      assert.equal(result.ok, true, JSON.stringify(result.diagnostic));
      assert.equal(result.studioDeliveryPath, '.omd/studio/delivery.json');
      assert.equal(result.finalEvidencePath, undefined);
      assert.deepEqual(result.limitations?.map(item => item.reason), ['open after 3 review rounds: finding-3']);
    }
  }
  const delivery = requireStudioDelivery(root, route);
  assert.equal(delivery.review.rounds, 3);
  assert.equal(delivery.picked.length > 0, true);
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'report-completion');

  // An edit after delivery is not the delivered page: the guard refuses it, and with the rounds spent
  // finish asks for the best iteration back instead of reviewing a fourth time.
  writeFileSync(join(root, 'index.html'), page(4));
  assert.equal(currentStudioDelivery(root, route), null);
  assert.throws(() => requireStudioDelivery(root, route), /STUDIO_DELIVERY_STALE/);
  assert.match(nextStageWork(root, packRoot, invocation).instruction, /review rounds are spent/);
  const fourth = await runModelLedCompletion({ root, packRoot, invocation, signal: t.signal });
  assert.equal(fourth.diagnostic?.code, 'FIRST_RENDER_RESTORE_BEFORE_DELIVERY');
  assert.equal(fourth.diagnostic?.next, 'omd first-render restore --json');

  // A hand-edited delivery loses its signature.
  writeFileSync(join(root, 'index.html'), page(3));
  const record = JSON.parse(readFileSync(join(root, '.omd/studio/delivery.json'), 'utf8'));
  assert.notEqual(currentStudioDelivery(root, route), null);
  writeFileSync(join(root, '.omd/studio/delivery.json'), JSON.stringify({ ...record, review: { ...record.review, openFindings: [] } }));
  assert.equal(currentStudioDelivery(root, route), null);
});

test('past the studio rounds a stall says deliver; other routes keep their ceiling message', () => {
  assert.match(stallMessage({ exhausted: true, studio: true }), /review rounds are spent.*omd lifecycle finish/);
  assert.match(stallMessage({ exhausted: true }), /reviews the loop stops/);
});
