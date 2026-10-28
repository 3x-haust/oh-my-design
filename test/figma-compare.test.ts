import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  FIGMA_COMPARE_SCHEMA,
  createFigmaCompareRecord,
  FIGMA_REGION_MISMATCH_THRESHOLD,
  figmaCompareRecordPath,
  readFigmaCompareRecord,
  renderFigmaPage,
  serializeFigmaCompareRecord,
} from '../core/figma/compare.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { compareImages } from '../core/figma/diff.ts';
import type { FigmaSnapshot } from '../core/figma/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

function uniformPng(width: number, height: number, color: readonly [number, number, number]): Buffer {
  const image = new PNG({ width, height });
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = color[0];
    image.data[index + 1] = color[1];
    image.data[index + 2] = color[2];
    image.data[index + 3] = 255;
  }
  return PNG.sync.write(image);
}
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

test('Figma compare writes whole and bounded region composites with intersecting exact facts', { timeout: 60_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-figma-compare-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const adapter = createTestProjectWriteAdapter(root);
  const htmlPath = join(root, 'fixture.html');
  writeFileSync(htmlPath, [
    '<!doctype html><meta charset="utf-8">',
    '<style>',
    '*{box-sizing:border-box}html,body{margin:0;width:120px;height:60px;overflow:hidden}',
    '#card{position:absolute;left:10px;top:10px;width:80px;height:30px;padding:4px 6px;',
    'background:rgb(255,0,0);color:rgb(255,255,255);border:2px solid rgb(0,0,0);',
    'border-radius:8px;font:600 14px/18px Arial;letter-spacing:1px;display:flex;gap:5px}',
    '</style><main id="card">Reserve now</main>',
  ].join(''));
  const renderPath = join(root, '.omd/figma/renders/1_2.png');
  const rendered = await renderFigmaPage(htmlPath, {
    viewport: { width: 120, height: 60 },
    out: renderPath,
    adapter,
  });
  const card = rendered.elements.find(element => element.selector === '#card');
  assert.ok(card);
  assert.equal(card.styles.fontSize, '14px');
  assert.equal(card.styles.borderRadius, '8px');
  assert.equal(card.styles.padding, '4px 6px');
  assert.equal(card.styles.gap, '5px');

  const snapshot: FigmaSnapshot = {
    fileKey: 'Fixture123',
    fileName: 'Fixture',
    capturedAt: '2026-10-17T00:00:00.000Z',
    pages: [{
      id: '0:1',
      name: 'Page',
      frames: [{
        id: '1:2',
        name: 'Desktop',
        nodes: [
          {
            id: '1:2',
            name: 'Desktop',
            type: 'FRAME',
            absoluteBoundingBox: { x: 100, y: 200, width: 120, height: 60 },
            fills: [],
            effects: [],
          },
          {
            id: '2:3',
            name: 'Reserve card',
            type: 'TEXT',
            absoluteBoundingBox: { x: 110, y: 210, width: 80, height: 30 },
            fills: [{ type: 'solid', hex: '#ff0000' }],
            strokes: [{ type: 'solid', hex: '#000000' }],
            strokeWeight: 2,
            effects: [],
            cornerRadius: 8,
            typography: {
              fontFamily: 'Arial',
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.29,
              lineHeightPx: 18,
              letterSpacing: 1,
            },
            characters: 'Reserve now',
          },
        ],
      }],
    }],
    componentSets: {},
  };
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot));
  const exportBytes = uniformPng(120, 60, [255, 255, 255]);
  const renderBytes = readFileSync(renderPath);
  const result = compareImages(exportBytes, renderBytes);
  assert.ok(result.cells.some(cell => cell.mismatch > FIGMA_REGION_MISMATCH_THRESHOLD));
  const diffBytes = Buffer.from('signed-diff-fixture');
  const page = snapshot.pages[0];
  assert.ok(page);
  const frame = page.frames[0];
  assert.ok(frame);
  const record = createFigmaCompareRecord(root, {
    frame,
    snapshot,
    snapshotBytes,
    exportBytes,
    renderBytes,
    diffBytes,
    result,
    renderedElements: rendered.elements,
    adapter,
  });
  adapter.write(figmaCompareRecordPath('1:2'), serializeFigmaCompareRecord(record));

  assert.equal(record.wholeComposite.width, 360);
  assert.equal(record.wholeComposite.height, 60);
  assert.ok(record.regions.length > 1);
  assert.ok(record.regions.length <= 9);
  const cellRegions = record.regions.filter(region => region.cell !== null);
  assert.deepEqual(cellRegions.map(region => region.cell?.mismatch),
    [...cellRegions].map(region => region.cell?.mismatch).sort((left, right) => (right ?? 0) - (left ?? 0)));
  const factualRegion = cellRegions.find(region =>
    region.figmaNodes.some(node => node.id === '2:3')
    && region.renderedElements.some(element => element.selector === '#card'));
  assert.ok(factualRegion);
  const figmaNode = factualRegion.figmaNodes.find(node => node.id === '2:3');
  assert.deepEqual(figmaNode?.box, { x: 10, y: 10, width: 80, height: 30 });
  assert.deepEqual(figmaNode?.stroke, { colors: ['#000000'], weight: 2 });
  assert.equal(figmaNode?.typography?.lineHeight, 18);
  assert.equal(figmaNode?.typography?.letterSpacing, 1);
  assert.equal(figmaNode?.text, 'Reserve now');
  assert.equal(factualRegion.composite.width, factualRegion.crop.width * 3);
  assert.equal(readFigmaCompareRecord(root, '1:2')?.signature, record.signature);
});

test('distributed above-floor mismatch retains an addressable whole-frame review region', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-figma-whole-region-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const adapter = createTestProjectWriteAdapter(root);
  const reference = uniformPng(60, 60, [255, 255, 255]);
  const buildImage = PNG.sync.read(reference);
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const index = ((row * 10 + dy) * 60 + col * 10 + dx) * 4;
        buildImage.data[index] = 0;
        buildImage.data[index + 1] = 0;
        buildImage.data[index + 2] = 0;
      }
    }
  }
  const render = PNG.sync.write(buildImage);
  const result = compareImages(reference, render);
  assert.equal(result.score, 0.96);
  assert.ok(result.cells.every(cell => cell.mismatch <= FIGMA_REGION_MISMATCH_THRESHOLD));
  const snapshot: FigmaSnapshot = {
    fileKey: 'Fixture123', fileName: 'Fixture', capturedAt: '2026-10-18T00:00:00.000Z',
    pages: [{ id: '0:1', name: 'Page', frames: [{
      id: '1:2', name: 'Desktop', nodes: [{
        id: '1:2', name: 'Desktop', type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 60 }, fills: [], effects: [],
      }],
    }] }], componentSets: {},
  };
  const frame = snapshot.pages[0]?.frames[0];
  assert.ok(frame);
  const record = createFigmaCompareRecord(root, {
    frame, snapshot, snapshotBytes: Buffer.from(JSON.stringify(snapshot)),
    exportBytes: reference, renderBytes: render, diffBytes: Buffer.from('diff'),
    result, renderedElements: [], adapter,
  });
  assert.equal(record.regions.length, 1);
  assert.equal(record.regions[0]?.index, 0);
  assert.equal(record.regions[0]?.cell, null);
});

test('signed compare records refuse traversal and symlinked image artifacts', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-figma-compare-path-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const adapter = createTestProjectWriteAdapter(root);
  const image = uniformPng(60, 60, [255, 255, 255]);
  const snapshot: FigmaSnapshot = {
    fileKey: 'Fixture123', fileName: 'Fixture', capturedAt: '2026-10-18T00:00:00.000Z',
    pages: [{ id: '0:1', name: 'Page', frames: [{
      id: '1:2', name: 'Desktop', nodes: [{
        id: '1:2', name: 'Desktop', type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 60 }, fills: [], effects: [],
      }],
    }] }], componentSets: {},
  };
  const frame = snapshot.pages[0]?.frames[0];
  assert.ok(frame);
  const record = createFigmaCompareRecord(root, {
    frame, snapshot, snapshotBytes: Buffer.from(JSON.stringify(snapshot)),
    exportBytes: image, renderBytes: image, diffBytes: Buffer.from('diff'),
    result: compareImages(image, image), renderedElements: [], adapter,
  });
  const forgedBody = {
    ...record,
    regions: record.regions.map(region => region.index === 0
      ? { ...region, composite: { ...region.composite, path: '../secret.png' } } : region),
  };
  const { signature: _oldSignature, ...unsigned } = forgedBody;
  adapter.write(figmaCompareRecordPath('1:2'), `${canonicalJson({
    ...unsigned,
    signature: signNativeObservation(root, FIGMA_COMPARE_SCHEMA, hash(canonicalJson(unsigned))),
  })}\n`);
  assert.equal(readFigmaCompareRecord(root, '1:2'), null);

  adapter.write(figmaCompareRecordPath('1:2'), serializeFigmaCompareRecord(record));
  const outside = join(root, 'outside.png');
  writeFileSync(outside, image);
  const wholePath = join(root, record.wholeComposite.path);
  unlinkSync(wholePath);
  symlinkSync(outside, wholePath);
  assert.equal(readFigmaCompareRecord(root, '1:2'), null);
});
