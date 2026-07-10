import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractIr, parseViewport } from '../core/render/index.ts';
import { normalize } from '../core/ir/normalize.ts';
import { extractInvariants } from '../core/ref/invariants.ts';
import { distances } from '../core/ref/distance.ts';
import { loadRefs, saveRef } from '../core/ref/store.ts';
import { must } from './helpers.ts';
import type { Invariants, Reference } from '../core/types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const SLOP = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-gran-'));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });

const viewport = parseViewport('390x844');

// ── component scope: a designer studies one button, not the whole page ──

test('extractIr with a selector reads only that subtree', async () => {
  const whole = await extractIr(SLOP, { viewport });
  const scoped = await extractIr(SLOP, { viewport, selector: '.cards' });

  assert.ok(scoped.nodes.length > 0);
  assert.ok(scoped.nodes.length < whole.nodes.length, 'a subtree is smaller than the page');
  assert.ok(scoped.nodes.every((n) => !n.path.includes('div.hero')), 'the hero is outside .cards');
});

test('a selector that matches nothing is an error, not a silent whole-page capture', async () => {
  await assert.rejects(() => extractIr(SLOP, { viewport, selector: '.does-not-exist' }), /selector/i);
});

test('invariants measured from a subtree differ from the whole page', async () => {
  const whole = extractInvariants(normalize(await extractIr(SLOP, { viewport })));
  const cards = extractInvariants(normalize(await extractIr(SLOP, { viewport, selector: '.cards' })));
  assert.notDeepEqual(whole.spacingLadder, cards.spacingLadder);
});

test('omd ref add --selector records the selector and marks it a component', () => {
  const dir = project();
  const r = run(['ref', 'add', SLOP, '--as', 'card-deck', '--selector', '.cards'], dir);
  assert.equal(r.status, 0);

  const ref = must(loadRefs(dir)[0]);
  assert.equal(ref.kind, 'component');
  assert.equal(ref.selector, '.cards');
  assert.ok(must(ref.invariants).radiusLadder.length > 0);
});

test('omd ref add without a selector captures the whole page', () => {
  const dir = project();
  run(['ref', 'add', SLOP, '--as', 'landing'], dir);
  const ref = must(loadRefs(dir)[0]);
  assert.equal(ref.kind, 'page');
  assert.equal(ref.selector, undefined);
  assert.ok(ref.invariants !== null);
});

test('the same source can be studied at two granularities at once', () => {
  const dir = project();
  run(['ref', 'add', SLOP, '--as', 'landing'], dir);
  run(['ref', 'add', SLOP, '--as', 'card-deck', '--selector', '.cards'], dir);
  assert.equal(loadRefs(dir).length, 2, 'component and page are distinct references');
});

// ── image references: reasoning only, and the type says so ──
//
// There is no spacing ladder to read out of a JPEG. Pretending otherwise would let
// `ref distance` report a similarity it never computed.

test('omd ref add --image stores no invariants at all', () => {
  const dir = project();
  const r = run(['ref', 'add', 'https://pinterest.com/pin/123', '--as', 'mood', '--image'], dir);
  assert.equal(r.status, 0);

  const ref = must(loadRefs(dir)[0]);
  assert.equal(ref.kind, 'image');
  assert.equal(ref.invariants, null);
  assert.deepEqual(ref.principles, []);
});

test('omd ref add --image never launches a browser, so it works on a pin URL', () => {
  const dir = project();
  const before = Date.now();
  run(['ref', 'add', 'https://pinterest.com/pin/123', '--as', 'mood', '--image'], dir);
  assert.ok(Date.now() - before < 3000, 'no headless render for an image reference');
});

test('an image reference still takes principles — that is its whole point', () => {
  const dir = project();
  run(['ref', 'add', './pin.png', '--as', 'mood', '--image'], dir);
  run(['ref', 'principles', './pin.png', '--as', 'mood', '--add', 'Warmth comes from paper texture, not from colour temperature.'], dir);
  assert.match(must(must(loadRefs(dir)[0]).principles[0]), /paper texture/);
});

// ── distance must not pretend to have measured what it did not ──

const measured = (source: string, inv: Invariants): Reference => ({
  source, component: 'page', kind: 'page', capturedAt: 'x', invariants: inv, principles: [],
});

const INV: Invariants = {
  spacingLadder: [4, 8, 16], radiusLadder: [4, 8], elevationLevels: 2,
  centeredRatio: 0.1, tokenCoverage: 0.7, paddingWeight: 12,
  typeScale: [14, 16], fontFamilies: ['inter'], weightLadder: [400, 600],
  motionDurations: [150], easingVocab: ['ease-out'], animatedShare: 0.04,
};

test('distances skips unmeasured references rather than scoring them zero', () => {
  const refs: Reference[] = [
    measured('https://linear.app', INV),
    { source: './pin.png', component: 'mood', kind: 'image', capturedAt: 'x', invariants: null, principles: ['warm'] },
  ];
  const out = distances(INV, refs);
  assert.equal(out.length, 1, 'an image cannot be compared, so it is not listed');
  assert.equal(must(out[0]).reference, 'https://linear.app');
});

test('omd ref distance says how many references it could not compare', () => {
  const dir = project();
  saveRef(dir, measured('https://linear.app', INV));
  run(['ref', 'add', './pin.png', '--as', 'mood', '--image'], dir);

  const out = run(['ref', 'distance', SLOP], dir);
  assert.match(out.stdout, /1 image reference/i, `must disclose what it skipped:\n${out.stdout}`);
});

test('omd ref distance with only image references compares nothing and says so', () => {
  const dir = project();
  run(['ref', 'add', './pin.png', '--as', 'mood', '--image'], dir);
  const out = run(['ref', 'distance', SLOP], dir);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /nothing to compare|no measured/i);
});

test('omd ref list shows the granularity of each reference', () => {
  const dir = project();
  run(['ref', 'add', SLOP, '--as', 'card-deck', '--selector', '.cards'], dir);
  run(['ref', 'add', './pin.png', '--as', 'mood', '--image'], dir);

  const out = run(['ref', 'list'], dir).stdout;
  assert.match(out, /component/);
  assert.match(out, /image/);
  assert.match(out, /\.cards/);
});

// Found in review: the scoped root is transparent, so the fallback fill of '#FFFFFF'
// resurrected the dark-card-on-dark-page bug through the selector path. The same text
// measured 1.66 contrast on the whole page and 11.37 when scoped to `.panel` — a component
// reference captured from a dark site would carry poisoned invariants.
test('a scoped subtree inherits the real backdrop behind it, not white', async () => {
  const dark = fileURLToPath(new URL('./fixtures/dark-scoped.html', import.meta.url));
  const scoped = normalize(await extractIr(dark, { viewport, selector: '.panel' }));
  const text = must(scoped.nodes.find((n) => n.type === 'TEXT'));
  const contrast = must(text.computed.contrastWithParent);
  assert.ok(contrast < 3, `dark text on a dark page must stay invisible when scoped, got ${contrast}`);
});
