import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRefs, refImagePath } from '../core/ref/store.ts';

// `omd ref add --selector … --blueprint --shot` pairs a scoped component's screenshot with its
// blueprint on one reference record, so image-first art direction can seed from both the picture
// and the structural data. The kinship gate still governs the shipped build.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const SLOP = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-shot-'));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });

test('--shot pairs a scoped component screenshot with its blueprint on one record', async () => {
  const dir = project();
  const result = run(['ref', 'add', SLOP, '--as', 'cards', '--selector', '.cards', '--blueprint', '--shot'], dir);
  assert.equal(result.status, 0, result.stderr);

  const refs = loadRefs(dir);
  assert.equal(refs.length, 1);
  const ref = refs[0]!;
  assert.equal(ref.kind, 'component');
  assert.ok(ref.blueprint !== undefined, 'blueprint captured');
  assert.ok(ref.imagePath !== undefined, 'imagePath recorded on the same record');

  // The recorded path resolves to a real, non-empty PNG.
  const shotAbs = refImagePath(dir, { source: SLOP, component: 'cards' });
  assert.ok(existsSync(shotAbs), 'the scoped screenshot PNG exists on disk');
  assert.ok(statSync(shotAbs).size > 0, 'the screenshot is not empty');
  assert.match(ref.imagePath!, /\.omd[\\/]refs[\\/].*cards\.png$/);
});

test('--shot without --selector is a usage error (a scoped shot needs a subtree)', () => {
  const dir = project();
  const result = run(['ref', 'add', SLOP, '--as', 'whole', '--shot'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--shot requires --selector/);
});

test('--blueprint alone still captures no screenshot (shot is opt-in)', async () => {
  const dir = project();
  const result = run(['ref', 'add', SLOP, '--as', 'cards', '--selector', '.cards', '--blueprint'], dir);
  assert.equal(result.status, 0, result.stderr);
  const ref = loadRefs(dir)[0]!;
  assert.ok(ref.blueprint !== undefined);
  assert.equal(ref.imagePath, undefined, 'no screenshot without --shot');
  assert.ok(!existsSync(refImagePath(dir, { source: SLOP, component: 'cards' })));
});

test('--no-energy skips the motion capture so a non-motion reference costs one browser launch', () => {
  const dir = project();
  const result = run(['ref', 'add', SLOP, '--as', 'cards', '--selector', '.cards', '--no-energy'], dir);
  assert.equal(result.status, 0, result.stderr);
  const ref = loadRefs(dir)[0]!;
  // The reference is still saved with its invariants; only the energy curve is omitted.
  assert.ok(ref.invariants !== null);
  assert.equal(ref.energyCurve ?? null, null, 'no energy curve captured with --no-energy');
});

test('ref add-batch captures many references over one browser with per-reference fidelity', () => {
  const dir = project();
  const manifest = join(dir, 'refs.json');
  writeFileSync(manifest, JSON.stringify([
    { source: SLOP, as: 'cards', selector: '.cards', blueprint: true, shot: true },
    { source: SLOP, as: 'hero', selector: '.hero' },
  ]));
  const result = run(['ref', 'add-batch', manifest], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2\/2 captured/);

  const refs = loadRefs(dir);
  assert.equal(refs.length, 2);
  const cards = refs.find((r) => r.component === 'cards')!;
  const hero = refs.find((r) => r.component === 'hero')!;
  // Same per-reference result as `omd ref add`: invariants always, blueprint/shot when requested.
  assert.ok(cards.invariants !== null && hero.invariants !== null);
  assert.ok(cards.blueprint !== undefined, 'cards captured its blueprint');
  assert.ok(cards.imagePath !== undefined && existsSync(join(dir, cards.imagePath)), 'cards shot exists');
  assert.equal(hero.blueprint, undefined, 'hero had no --blueprint');
  assert.equal(hero.imagePath, undefined, 'hero had no shot');
  // Batch skips the energy pass (motion refs use single-ref add) — output-neutral for these.
  assert.equal(cards.energyCurve ?? null, null);
});

test('ref add-batch reports a failed reference without failing the whole batch', () => {
  const dir = project();
  const manifest = join(dir, 'refs.json');
  writeFileSync(manifest, JSON.stringify([
    { source: SLOP, as: 'ok', selector: '.cards' },
    { source: SLOP, as: 'bad', selector: '.does-not-exist-xyz' },
  ]));
  const result = run(['ref', 'add-batch', manifest], dir);
  // One selector matches nothing → that entry fails (exit 1), the other still saves.
  assert.equal(result.status, 1);
  const refs = loadRefs(dir);
  assert.ok(refs.some((r) => r.component === 'ok'), 'the valid reference was still saved');
});
