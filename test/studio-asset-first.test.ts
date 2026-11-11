import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { classifyPiWrite } from '../extensions/omd-guard.ts';
import { cutAsset } from '../core/design/asset-cut.ts';
import { composeGuidance } from '../core/design/compose-guidance.ts';
import { requireStudioSystem, studioPending } from '../core/design/studio.ts';
import { publishAsset, recordImage } from '../core/design/studio-images.ts';
import { composeBoard, composeSheet } from '../core/design/studio-sheets.ts';
import { assetsIssue, boardIssue, directionIssue, readBoardInput, redesignRequested } from '../core/design/studio-stages.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { chooseDirection, idea, pinBoard, sheet, shipAssets } from './helpers/studio-stages.ts';

type Route = Parameters<typeof composeGuidance>[0];
const route = (taskNeed: string, request = 'Build a budget app.') =>
  ({ request, projectMode: 'existing', sourceContract: { referenceDiscovery: { taskNeed } } }) as unknown as Route;
const project = (t: { after: (fn: () => void) => void }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-asset-first-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, writer: createTestProjectWriteAdapter(root, createTestProjectRunInvocation(root)) };
};
const write = (root: string, path: string, content: string | Buffer) => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
};
/** A set of square items in distinct colours on a flat ground, like a generated icon sheet. */
const iconSheet = (items: number, ground: readonly [number, number, number] = [250, 248, 244], blank = -1): Buffer => {
  const image = new PNG({ width: 60 * items, height: 60 });
  for (let at = 0; at < image.data.length; at += 4) image.data.set([...ground, 255], at);
  for (let item = 0; item < items; item++) {
    if (item === blank) continue;
    for (let y = 15; y < 45; y++) for (let x = item * 60 + 15; x < item * 60 + 45; x++) {
      const at = (y * image.width + x) * 4;
      // A white detail inside each item stays: only background reached from the border is cut.
      const detail = y > 27 && y < 33 && x > item * 60 + 27 && x < item * 60 + 33;
      image.data.set(detail ? [...ground, 255] : [40 + item * 60, 90, 200 - item * 50, 255], at);
    }
  }
  return PNG.sync.write(image);
};

test('the reference board pins one image per job, refuses whole pages and generated images, and is composed into one sheet', { timeout: 120_000 }, async t => {
  const { root, writer } = project(t);
  const shot = (name: string, colour: number) => { const image = new PNG({ width: 40, height: 30 }); image.data.fill(colour); write(root, name, PNG.sync.write(image)); };
  shot('.omd/refs/design/row.png', 200);
  shot('.omd/refs/design/badge.png', 90);
  shot('.omd/studio/refs/quiet-tools/full.png', 10);
  write(root, '.omd/refs/design/badge.json', JSON.stringify({ sourceUrl: 'https://www.behance.net/gallery/1/badges' }));
  const board = (items: unknown[]) => write(root, '.omd/studio/board.json', JSON.stringify({ items }));
  assert.match(boardIssue(root)!, /no reference board is written yet/);
  // Refused inputs compose nothing.
  board([{ image: '.omd/studio/refs/quiet-tools/full.png', for: 'home', job: 'section rhythm of the page' }]);
  assert.throws(() => readBoardInput(root), /STUDIO_BOARD_INVALID: .*is a whole page/);
  idea(root, 'concept-a-1', 'board', 5);
  board([{ image: '.omd/ideas/concept-a-1.png', for: 'home', job: 'a direction for the home screen' }]);
  assert.throws(() => readBoardInput(root), /is a generated image/);
  board([{ image: '.omd/refs/design/row.png', for: 'list', job: 'ok' }]);
  assert.throws(() => readBoardInput(root), /needs "job"/);
  await assert.rejects(composeBoard(root, writer), /STUDIO_BOARD_INVALID/);
  assert.equal(existsSync(join(root, '.omd/studio/board.png')), false);
  // One image per job, grouped by what it serves; the source is read from the kept record when not written.
  board([{ image: '.omd/refs/design/row.png', for: 'transaction list', job: 'row density and right-aligned amounts', source: 'https://dribbble.com/shots/9' },
    { image: '.omd/refs/design/badge.png', for: 'rank badges', job: 'winged medal silhouette' }]);
  assert.match(boardIssue(root)!, /not composed yet: run omd studio board/);
  const composed = await composeBoard(root, writer);
  assert.deepEqual(composed.groups, { 'transaction list': ['row density and right-aligned amounts'], 'rank badges': ['winged medal silhouette'] });
  assert.equal(composed.items[1]!.source, 'https://www.behance.net/gallery/1/badges');
  assert.ok(PNG.sync.read(readFileSync(join(root, '.omd/studio/board.png'))).width >= 800);
  assert.equal(boardIssue(root), null);
  board([{ image: '.omd/refs/design/row.png', for: 'transaction list', job: 'row density only' }]);
  assert.match(boardIssue(root)!, /changed after the sheet was composed/);
});

test('a comparison sheet sets images and built screens side by side beside the board, labelled in order', { timeout: 120_000 }, async t => {
  const { root, writer } = project(t);
  pinBoard(root);
  const a = idea(root, 'coins-1', 'asset', 11), b = idea(root, 'coins-2', 'asset', 12);
  write(root, 'variants/path.html', '<!doctype html><body style="margin:0;background:#fde"><h1>Path</h1></body>');
  await assert.rejects(composeSheet(root, writer, 'coins', [a]), /at least two candidates/);
  await assert.rejects(composeSheet(root, writer, 'coins', [a, 'missing.png']), /does not exist/);
  const record = await composeSheet(root, writer, 'Coins', [a, b, 'variants/path.html'], 'mobile');
  assert.deepEqual(record.members.map(member => [member.label, member.source]), [['A', a], ['B', b], ['C', 'variants/path.html']]);
  assert.equal(record.name, 'coins');
  assert.notEqual(record.board, null);
  assert.ok(existsSync(join(root, '.omd/studio/sheets/coins.png')));
  assert.ok(existsSync(join(root, '.omd/studio/sheets/coins.json')));
});

test('a direction is chosen among at least three concept boards set side by side; unavailability is the only way past without one', t => {
  const { root } = project(t);
  assert.match(directionIssue(root)!, /0 concept boards drawn and no direction chosen/);
  const boards = ['concept-a-1', 'concept-b-1'].map((name, index) => idea(root, name, 'board', 20 + index));
  const page = idea(root, 'hero-1', 'page', 30);
  const direction = (value: object) => write(root, '.omd/studio/direction.json', JSON.stringify(value));
  direction({ sheet: 'concepts', chosen: boards[0], because: 'the coins become the ledger itself', lost: [{ board: boards[1], because: 'a recoloured dashboard' }] });
  assert.match(directionIssue(root)!, /compares 2 concept boards; choose among at least 3/);
  direction({ sheet: 'concepts', chosen: boards[0], because: 'the coins become the ledger itself', lost: [{ board: boards[1], because: 'a recoloured dashboard' }, { board: page, because: 'only one section' }] });
  assert.match(directionIssue(root)!, /hero-1\.png is not a concept board/);
  const third = idea(root, 'concept-c-1', 'board', 22);
  direction({ sheet: 'concepts', chosen: boards[0], because: 'the coins become the ledger itself', lost: [{ board: boards[1], because: 'a recoloured dashboard' }, { board: third, because: 'stock 3D blobs' }] });
  assert.match(directionIssue(root)!, /no sheet named concepts/);
  sheet(root, 'concepts', [boards[0]!, boards[1]!]);
  assert.match(directionIssue(root)!, /concept-c-1\.png is not on the concepts sheet/);
  sheet(root, 'concepts', [boards[0]!, boards[1]!, third]);
  assert.equal(directionIssue(root), null);
  // A board regenerated after the sheet is no longer the one compared.
  writeFileSync(join(root, third), 'changed');
  assert.match(directionIssue(root)!, /not on the concepts sheet as it is now/);
  rmSync(join(root, '.omd/studio/direction.json'));
  write(root, '.omd/ideas/unavailable.json', '{"reason":"no codex"}');
  assert.equal(directionIssue(root), null);
});

test('an asset set is picked by pairwise comparison and shipped through the publisher; a skip is a fallback, not a shortcut', t => {
  const { root, writer } = project(t);
  assert.match(assetsIssue(root)!, /0 asset candidates drawn/);
  const candidates = [1, 2, 3].map(index => idea(root, `coins-${index}`, 'asset', 60 + index));
  writeFileSync(join(root, candidates[1]!), iconSheet(3));
  const assets = (rounds: object[], chosen: string) => write(root, '.omd/studio/assets.json', JSON.stringify({ sets: [{ name: 'coins', for: 'every list and the balance', sheet: 'coins', rounds, chosen }] }));
  const round = (a: string, b: string, winner: string) => ({ a, b, winner, because: 'one light across the set' });
  assets([round(candidates[0]!, candidates[1]!, candidates[1]!)], candidates[1]!);
  assert.match(assetsIssue(root)!, /compares 2 candidates; generate at least 3/);
  assets([round(candidates[0]!, candidates[1]!, candidates[1]!), round(candidates[1]!, candidates[2]!, candidates[2]!)], candidates[1]!);
  sheet(root, 'coins', candidates);
  assert.match(assetsIssue(root)!, /coins-2\.png lost a round/);
  assets([round(candidates[0]!, candidates[1]!, candidates[1]!), round(candidates[1]!, candidates[2]!, candidates[1]!)], candidates[1]!);
  assert.match(assetsIssue(root)!, /is chosen but not shipped: omd studio asset/);
  // A skip with candidates already compared is a choice of the rig; without candidates, and with a working tool, it is refused.
  write(root, '.omd/studio/skips.json', JSON.stringify({ assets: { instead: 'rig', because: 'the glass coin in three.js reads better at hero size' } }));
  assert.equal(assetsIssue(root), null);
  rmSync(join(root, '.omd/studio/assets.json'));
  assert.match(assetsIssue(root)!, /image generation works here: generate the candidate sets and compare them first/);
  write(root, '.omd/studio/skips.json', JSON.stringify({ assets: { instead: 'photo', because: 'the glass coin in three.js reads better' } }));
  assert.throws(() => assetsIssue(root), /STUDIO_SKIP_INVALID: .*"instead": "rig" or "code"/);
  rmSync(join(root, '.omd/studio/skips.json'));
  assets([round(candidates[0]!, candidates[1]!, candidates[1]!), round(candidates[1]!, candidates[2]!, candidates[1]!)], candidates[1]!);
  sheet(root, 'coins', candidates);
  const shipped = publishAsset(root, writer, { candidate: candidates[1]!, out: 'public/assets/coins', cut: true, split: 'auto', names: ['bronze', 'silver', 'gold'] });
  assert.deepEqual(shipped.files, ['public/assets/coins/bronze.png', 'public/assets/coins/silver.png', 'public/assets/coins/gold.png']);
  assert.equal(assetsIssue(root), null);
  const rows = JSON.parse(readFileSync(join(root, '.omd/studio/images.json'), 'utf8'));
  assert.deepEqual(rows[0].generated, { tool: 'codex exec (image_generation)', prompt: 'asset candidate coins-2', candidate: candidates[1], kind: 'asset', set: 'coins' });
  assert.equal(rows[0].licence, 'own');
});

test('omd studio asset cuts the plain ground, splits a set into trimmed items and never ships a page idea or concept board', t => {
  const { root, writer } = project(t);
  const [first, second, third] = cutAsset(iconSheet(3), { cut: true, split: 'auto' });
  assert.ok(first && second && third);
  const item = PNG.sync.read(first!);
  // Trimmed to the item with clear space, the ground transparent, the enclosed light detail kept.
  assert.ok(item.width >= 30 && item.width < 45, `width ${item.width}`);
  assert.equal(item.data[3], 0);
  const centre = (Math.floor(item.height / 2) * item.width + Math.floor(item.width / 2)) * 4;
  assert.equal(item.data[centre + 3], 255);
  assert.equal(cutAsset(iconSheet(4, [250, 248, 244], 2), { cut: true, split: { columns: 4, rows: 1 } }).length, 3, 'empty grid cells are dropped');
  assert.throws(() => cutAsset(iconSheet(2), { cut: false, split: 'auto' }), /--split auto finds items on transparency/);
  assert.throws(() => cutAsset(Buffer.from('jpeg'), { cut: true, split: 'none' }), /ASSET_NOT_PNG/);
  const page = idea(root, 'hero-1', 'page', 3), board = idea(root, 'concept-a-1', 'board', 4), graphic = idea(root, 'glass-coin-1', 'graphic', 5);
  for (const candidate of [page, board]) {
    assert.throws(() => publishAsset(root, writer, { candidate, out: 'public/hero.png', cut: false, split: 'none' }), /STUDIO_ASSET_MOCKUP: .*never ships/);
  }
  assert.throws(() => publishAsset(root, writer, { candidate: 'public/x.png', out: 'public/x.png', cut: false, split: 'none' }), /STUDIO_ASSET_UNKNOWN/);
  assert.throws(() => publishAsset(root, writer, { candidate: graphic, out: '.omd/x.png', cut: false, split: 'none' }), /in the design record/);
  assert.throws(() => publishAsset(root, writer, { candidate: graphic, out: '../x.png', cut: false, split: 'none' }), /outside the project/);
  assert.equal(existsSync(join(root, 'public')), false, 'a refused publish writes nothing');
  assert.equal(existsSync(join(root, '.omd/studio/images.json')), false);
  // A key-visual object generated as a graphic idea ships whole.
  assert.deepEqual(publishAsset(root, writer, { candidate: graphic, out: 'public/coin.png', cut: false, split: 'none' }).files, ['public/coin.png']);
  assert.deepEqual(readdirSync(join(root, 'public')), ['coin.png']);
});

test('omd studio image records an openly licensed image and refuses stock, closed licences and generated files', t => {
  const { root, writer } = project(t);
  write(root, 'public/poster.png', iconSheet(1));
  assert.throws(() => recordImage(root, writer, { file: 'public/poster.png', source: 'https://images.unsplash.com/photo-1', licence: 'CC0-1.0' }), /licenses on terms of its own/);
  assert.throws(() => recordImage(root, writer, { file: 'public/poster.png', source: 'https://example.org/p', licence: 'CC-BY-NC' }), /not an open licence/);
  const generated = idea(root, 'coin-1', 'asset', 9);
  write(root, 'public/coin.png', readFileSync(join(root, generated)));
  assert.throws(() => recordImage(root, writer, { file: 'public/coin.png', source: 'own', licence: 'own' }), /publish it with omd studio asset/);
  assert.equal(existsSync(join(root, '.omd/studio/images.json')), false);
  recordImage(root, writer, { file: 'public/poster.png', source: 'https://commons.wikimedia.org/wiki/File:P.png', licence: 'public-domain' });
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.omd/studio/images.json'), 'utf8')).map((row: { file: string }) => row.file), ['public/poster.png']);
});

test('a product passes board, direction and assets before its source; a redesign passes baseline and ledger first; a non-redesign says why', t => {
  const { root } = project(t);
  const product = route('new-product', '가계부 모바일 앱 만들어줘');
  write(root, '.omd/studio/refs/toss-im/study.json', JSON.stringify({ requested: 'https://toss.im/' }));
  write(root, '.omd/studio/refs/toss-im/first-screen.png', iconSheet(1));
  write(root, '.omd/studio/refs/toss-im/full.png', iconSheet(1));
  assert.equal(studioPending(root, product), 'board');
  assert.throws(() => requireStudioSystem(root, product), /STUDIO_BOARD_MISSING/);
  pinBoard(root);
  chooseDirection(root);
  assert.equal(studioPending(root, product), 'system');
  // Redesign: detected from the request on existing work, never on a local fix or a new surface.
  assert.equal(redesignRequested('가계부 앱 리디자인 해줘'), true);
  assert.equal(redesignRequested('Redesign the settings screen'), true);
  assert.equal(redesignRequested('Fix the button colour on settings'), false);
  const other = project(t).root;
  const redesign = route('existing-product-change', 'Redesign the budget app');
  assert.equal(studioPending(other, route('existing-product-change', 'Fix the button colour')), null);
  assert.equal(studioPending(other, redesign), 'baseline');
  assert.throws(() => requireStudioSystem(other, redesign), /STUDIO_BASELINE_MISSING: .*omd studio baseline/);
  write(other, '.omd/studio/baseline/home/screen.json', JSON.stringify({ name: 'home', url: 'http://localhost:7101/', route: '/', controls: ['Add'], routes: [] }));
  assert.equal(studioPending(other, redesign), 'ledger');
  assert.throws(() => requireStudioSystem(other, redesign), /STUDIO_LEDGER_MISSING/);
  write(other, '.omd/studio/ledger.json', JSON.stringify({ keep: ['the green mark'], change: [] }));
  assert.equal(studioPending(other, redesign), 'board');
  pinBoard(other);
  chooseDirection(other);
  assert.equal(studioPending(other, redesign), 'assets');
  assert.throws(() => requireStudioSystem(other, redesign), /STUDIO_ASSETS_MISSING/);
  shipAssets(other);
  assert.equal(studioPending(other, redesign), null);
  requireStudioSystem(other, redesign);
  // A request that only mentions the word, recorded as not a redesign, is not held.
  const misread = project(t).root;
  write(misread, '.omd/studio/skips.json', JSON.stringify({ redesign: { because: 'only the copy on one button changes, nothing is redesigned' } }));
  assert.equal(studioPending(misread, redesign), null);
});

// The studio records belong to the retired gated workflow; its prompt is kept in src/legacy beside the guides it cites.
test('every record the skill and guides tell the designer to write is writable in Pi or has a publisher the skill names', () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
  const skill = read('src/legacy/ultradesign-gated.md');
  const texts = [skill, ...['assets', 'marketing', 'product', 'redesign', 'material-stage'].map(name => read(`core/guides/${name}.md`))];
  const published: Readonly<Record<string, string>> = {
    '.omd/studio/images.json': 'omd studio asset', '.omd/studio/board.png': 'omd studio board', '.omd/studio/refs': 'omd studio refs',
    '.omd/studio/baseline': 'omd studio baseline', '.omd/studio/redesign': 'omd studio check --mode redesign', '.omd/studio/logo.png': 'logo',
  };
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-asset-first-guard-')));
  try {
    const paths = new Set(texts.flatMap(text => [...text.matchAll(/\.omd\/studio\/[a-z0-9_./-]*[a-z0-9]/g)].map(match => match[0])));
    assert.ok(paths.has('.omd/studio/assets.json') && paths.has('.omd/studio/images.json'));
    for (const path of paths) {
      if (classifyPiWrite(root, path).kind === 'authoring') continue;
      const publisher = Object.entries(published).find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
      assert.ok(publisher !== undefined, `${path} is named in the skill but neither writable nor published`);
      assert.ok(skill.includes(publisher) || texts.some(text => text.includes(publisher)), `${path}: the skill does not name ${publisher}`);
    }
    assert.match(skill, /images\.json` is written only by `omd studio asset`[\s\S]*`omd studio image/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the publishers run from the CLI entry', { timeout: 60_000 }, t => {
  const { root } = project(t);
  write(root, 'public/poster.png', iconSheet(1));
  const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  const recorded = run('studio', 'image', 'public/poster.png', '--source', 'own', '--licence', 'own', '--json');
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).file, 'public/poster.png');
  const candidate = idea(root, 'coins-1', 'asset', 8);
  writeFileSync(join(root, candidate), iconSheet(2));
  const shipped = run('studio', 'asset', candidate, '--out', 'public/coins', '--cut', '--split', 'auto', '--json');
  assert.equal(shipped.status, 0, shipped.stderr);
  assert.deepEqual(JSON.parse(shipped.stdout).files, ['public/coins/coins-1.png', 'public/coins/coins-2.png']);
});
