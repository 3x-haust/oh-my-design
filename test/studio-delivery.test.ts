import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { PNG } from 'pngjs';
import { runModelLedCompletion } from '../bin/model-led-completion-command.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { modelLedCompletionFingerprint } from '../core/runtime/model-led-execution.ts';
import { stallMessage } from '../core/design/first-render-loop-state.ts';
import { currentStudioDelivery, requireStudioDelivery, STUDIO_REVIEW_ROUNDS, studioSite } from '../core/design/studio-delivery.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const packRoot = fileURLToPath(new URL('../core', import.meta.url));
const fixtureCli = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
const fixtureHost = {
  nodePath: realpathSync(process.execPath), nodeSha256: hash(readFileSync(process.execPath)),
  cliPath: fixtureCli, cliSha256: hash(readFileSync(fixtureCli)),
  provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'delivery-parent',
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
/** A studied site and the system taken from it, as omd studio refs and the maker leave them. */
const studied = (root: string, url: string) => {
  const dir = join(root, '.omd/studio/refs/quiet-tools');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'study.json'), JSON.stringify({ requested: url, typeRamp: [], sections: [] }));
  const image = new PNG({ width: 4, height: 4 });
  writeFileSync(join(dir, 'first-screen.png'), PNG.sync.write(image));
  writeFileSync(join(dir, 'full.png'), PNG.sync.write(image));
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ reference: url, sizes: [14, 18, 24, 32], weights: [400, 700] }));
  writeFileSync(join(root, '.omd/studio/system.md'), `${'Borrowed from Quiet Tools: 32/18 type, two weights, generous rhythm. '.repeat(8)}`);
};
const fixture = (t: { after: (fn: () => void) => void }, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
};

test('a new page is held to its system, compared once with its reference and delivered with what that look names', { timeout: 300_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-studio-delivery-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for this project.';
  const { invocation, writer } = createModelLedRouteContext(root, request, { host: fixtureHost });
  const input = modelLedInput(request);
  (input.referenceDiscovery as Record<string, unknown>).taskNeed = 'new-marketing';
  input.allowedPaths = ['index.html'];
  publishAdaptiveRoute(root, input, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  studied(root, 'https://quiet.tools/');
  // The first screen arrives with a rise and the recreated product keeps working on its own, as the floors ask of a new page.
  const page = (round: number, link = 'Start') => `<!doctype html><html><head><style>@keyframes rise { from { opacity: 0; transform: translateY(16px) } }
    h1 { animation: rise 600ms cubic-bezier(0.22, 1, 0.36, 1) both }</style></head><body style="font:400 18px Arial;margin:24px"><main>
    <h1 style="font:700 32px Arial">Quiet tools</h1><p>Round ${round}</p><a href="#start">${link}</a>
    <div data-product style="width:900px;font:400 12px monospace">${Array.from({ length: 8 }, (_, line) => `<div>quiet ${line}</div>`).join('')}</div></main>
    <script>let tick = 0; setInterval(() => { document.querySelector('[data-product] div').textContent = 'quiet ' + ++tick; }, 400);</script></body></html>`;

  // An arrow glyph on a link leaves the system: finish refuses before any review is spent.
  writeFileSync(join(root, 'index.html'), page(1, 'Start ↗'));
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'compose-first-render');
  assert.throws(() => requireStudioDelivery(root, route), /STUDIO_DELIVERY_REQUIRED/);
  const drifted = await runModelLedCompletion({ root, packRoot, invocation, signal: t.signal });
  assert.equal(drifted.ok, false);
  assert.match(drifted.diagnostic?.message ?? '', /STUDIO_SYSTEM_DRIFT: .*arrow glyphs or trailing icons on links or buttons "Start ↗"/);
  assert.equal(currentStudioDelivery(root, route), null);

  // Held to the system, the page gets its one comparison with the reference and ships with what it names.
  writeFileSync(join(root, 'index.html'), page(1));
  fixture(t, { PI_REVIEWER_FIXTURE_MODE: 'early-revise', PI_REVIEWER_FIXTURE_FINDING_ID: 'hero-crowded' });
  const delivered = await runModelLedCompletion({ root, packRoot, invocation, signal: t.signal });
  assert.equal(delivered.ok, true, JSON.stringify(delivered.diagnostic));
  assert.equal(delivered.studioDeliveryPath, '.omd/studio/delivery.json');
  assert.equal(delivered.finalEvidencePath, undefined);
  assert.deepEqual(delivered.limitations?.map(item => item.reason), ['open after the comparison with the reference: hero-crowded']);
  const delivery = requireStudioDelivery(root, route);
  assert.equal(delivery.review.rounds, STUDIO_REVIEW_ROUNDS);
  assert.equal(delivery.reference, 'https://quiet.tools/');
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'report-completion');
  // A browser plan the maker wrote by hand is no part of a new page: a malformed one never breaks the completion
  // fingerprint the end-of-turn check takes, it only changes it.
  const unplanned = modelLedCompletionFingerprint(root);
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  writeFileSync(join(root, '.omd/.cache/trusted-lifecycle-manifest.json'), JSON.stringify({ scripts: [{}, { assertions: [{}] }] }));
  assert.notEqual(modelLedCompletionFingerprint(root), unplanned);
  assert.equal(nextStageWork(root, packRoot, invocation).action, 'report-completion');
  rmSync(join(root, '.omd/.cache/trusted-lifecycle-manifest.json'));

  // An edit after delivery is not the delivered page: the guard refuses it, and finish asks for the compared page
  // back instead of reviewing a second time.
  writeFileSync(join(root, 'index.html'), page(2));
  assert.equal(currentStudioDelivery(root, route), null);
  assert.throws(() => requireStudioDelivery(root, route), /STUDIO_DELIVERY_STALE/);
  assert.match(nextStageWork(root, packRoot, invocation).instruction, /has had its comparison with the reference/);
  const again = await runModelLedCompletion({ root, packRoot, invocation, signal: t.signal });
  assert.equal(again.diagnostic?.code, 'FIRST_RENDER_RESTORE_BEFORE_DELIVERY');

  // A hand-edited delivery loses its signature.
  writeFileSync(join(root, 'index.html'), page(1));
  const record = JSON.parse(readFileSync(join(root, '.omd/studio/delivery.json'), 'utf8'));
  assert.notEqual(currentStudioDelivery(root, route), null);
  writeFileSync(join(root, '.omd/studio/delivery.json'), JSON.stringify({ ...record, review: { ...record.review, openFindings: [] } }));
  assert.equal(currentStudioDelivery(root, route), null);
});

test('past the studio rounds a stall says deliver; other routes keep their ceiling message', () => {
  assert.match(stallMessage({ exhausted: true, studio: true }), /comparison with the reference.*omd lifecycle finish/);
  assert.match(stallMessage({ exhausted: true }), /reviews the loop stops/);
});

test('a new page is delivered from the root build, or from the site package beside the project when the root builds no page', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-studio-site-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), '{}');
  assert.deepEqual(studioSite(root), { dir: '', entry: 'index.html' });
  // test-320: oh-my-design's site lives in website/; a folder without its own package is not a site.
  for (const dir of ['website', 'docs', 'notes']) mkdirSync(join(root, dir, 'dist'), { recursive: true });
  writeFileSync(join(root, 'website/package.json'), '{}');
  writeFileSync(join(root, 'docs/package.json'), '{}');
  writeFileSync(join(root, 'website/dist/index.html'), '<h1>site</h1>');
  writeFileSync(join(root, 'notes/dist/index.html'), '<h1>notes</h1>');
  assert.deepEqual(studioSite(root), { dir: 'website', entry: 'website/dist/index.html' });
  // With two sites, the one just built.
  writeFileSync(join(root, 'docs/index.html'), '<h1>docs</h1>');
  utimesSync(join(root, 'website/dist/index.html'), new Date(1000), new Date(1000));
  assert.deepEqual(studioSite(root), { dir: 'docs', entry: 'docs/index.html' });
  // A page built at the root still wins.
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), '<h1>root</h1>');
  assert.deepEqual(studioSite(root), { dir: '', entry: 'dist/index.html' });
});
