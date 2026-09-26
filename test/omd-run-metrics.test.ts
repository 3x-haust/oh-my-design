import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  collectRunMetrics,
  isExactlyWhiteCssValue,
} from '../scripts/omd-run-metrics.ts';

function writeFixtureFile(root: string, relativePath: string, contents = ''): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeFixtureFile(root, relativePath, `${JSON.stringify(value)}\n`);
}

test('collectRunMetrics reports application, discovery, reference, exclusion, and CSS metrics', (t) => {
  const runDir = mkdtempSync(join(tmpdir(), 'omd-run-metrics-'));
  t.after(() => rmSync(runDir, { recursive: true, force: true }));

  const appFiles = [
    'src/App.tsx',
    'src/View.jsx',
    'src/types.ts',
    'src/util.js',
    'src/theme.css',
    'public/index.html',
    'src/Card.vue',
    'src/Thing.svelte',
  ];
  for (const path of appFiles) writeFixtureFile(runDir, path);
  writeFixtureFile(runDir, 'src/readme.md');
  writeFixtureFile(runDir, 'node_modules/pkg/index.js');
  writeFixtureFile(runDir, 'dist/bundle.js');
  writeFixtureFile(runDir, '.omd/internal.ts');
  writeFixtureFile(runDir, '.omc/cache.ts');

  writeFixtureFile(runDir, 'src/theme.css', `
    :root {
      --canvas: #fff;
      --surface-raised: #fff;
    }
    html { background-color: rgb(255, 255, 255); }
    body {
      background: var(--canvas);
      font-size: 14px;
      font-family: "Fixture Mono", ui-monospace, monospace;
    }
    .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .08em;
      border: 1px solid #ddd;
      border-left-width: 1px;
      border-radius: 8px;
      border-top-left-radius: 4px;
    }
    .zero-tracking {
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .negative-tracking {
      text-transform: uppercase;
      letter-spacing: -.1em;
    }
    .display {
      font-size: clamp(12px, 4vw, 32px);
      font-family: sans-serif;
      border: 10px solid #000;
    }
    .mono-shorthand { font: 500 13px "Other Mono", monospace; }
  `);
  writeFixtureFile(runDir, 'node_modules/pkg/ignored.css', `
    body { background: #000; font-size: 1px; border: 1px solid; border-radius: 99px; }
  `);
  writeFixtureFile(runDir, 'dist/ignored.css', `
    body { background: white; font-size: 2px; font-family: monospace; }
  `);

  writeJson(runDir, '.omd/discovery/design/search-a.json', { status: 'ok', provider: 'alpha' });
  writeJson(runDir, '.omd/discovery/design/search-b.json', { status: 'ok', provider: 'beta' });
  writeJson(runDir, '.omd/discovery/design/missing-provider.json', { status: 'ignored' });
  writeJson(runDir, '.omd/discovery/design/entries/not-a-search.json', { status: 'nested', provider: 'alpha' });
  writeJson(runDir, '.omd/discovery/domain/search-c.json', { status: 'error', provider: 'alpha' });

  writeJson(runDir, '.omd/discovery/design/excluded/one.json', {});
  writeJson(runDir, '.omd/discovery/domain/excluded/two.json', {});
  writeJson(runDir, '.omd/discovery/domain/excluded/three.json', {});
  writeFixtureFile(runDir, '.omd/discovery/domain/excluded/readme.txt');

  writeFixtureFile(runDir, '.omd/refs/design/home.png');
  writeFixtureFile(runDir, '.omd/refs/design/nested/detail.png');
  writeFixtureFile(runDir, '.omd/refs/domain/market.png');
  writeFixtureFile(runDir, '.omd/refs/domain/not-retained.jpg');

  const metrics = collectRunMetrics(runDir);

  assert.equal(metrics.runDir, resolve(runDir));
  assert.equal(metrics.appProduced, 8);
  assert.deepEqual(metrics.discovery, {
    byLaneStatus: {
      design: { ok: 2 },
      domain: { error: 1 },
    },
    byProviderStatus: {
      alpha: { error: 1, ok: 1 },
      beta: { ok: 1 },
    },
  });
  assert.equal(metrics.retainedReferenceImages, 3);
  assert.equal(metrics.excluded, 3);
  assert.deepEqual(metrics.css, {
    fileCount: 1,
    dominantCanvasBackground: '#fff',
    canvasIsExactlyWhite: true,
    fontSizePxValues: [10.5, 11, 12, 14, 32],
    smallFontSizeCount: 2,
    maxFontSizePx: 32,
    monospaceFontFamilyUsageCount: 2,
    uppercasePositiveLetterSpacingCount: 1,
    border1pxDeclarationCount: 2,
    borderRadiusDeclarationCount: 2,
  });
});

test('collectRunMetrics reports empty and non-white cases without false positives', (t) => {
  const runDir = mkdtempSync(join(tmpdir(), 'omd-run-metrics-non-white-'));
  t.after(() => rmSync(runDir, { recursive: true, force: true }));

  writeFixtureFile(runDir, 'src/plain.css', `
    body .card { background: #fff; }
    body {
      background: #f6f4ef;
      font-size: 12px;
      font-family: sans-serif;
      text-transform: uppercase;
      letter-spacing: -.01em;
      border: 2px solid #222;
    }
  `);

  const metrics = collectRunMetrics(runDir);

  assert.equal(metrics.appProduced, 1);
  assert.deepEqual(metrics.discovery, { byLaneStatus: {}, byProviderStatus: {} });
  assert.equal(metrics.retainedReferenceImages, 0);
  assert.equal(metrics.excluded, 0);
  assert.deepEqual(metrics.css, {
    fileCount: 1,
    dominantCanvasBackground: '#f6f4ef',
    canvasIsExactlyWhite: false,
    fontSizePxValues: [12],
    smallFontSizeCount: 0,
    maxFontSizePx: 12,
    monospaceFontFamilyUsageCount: 0,
    uppercasePositiveLetterSpacingCount: 0,
    border1pxDeclarationCount: 0,
    borderRadiusDeclarationCount: 0,
  });
});

test('isExactlyWhiteCssValue accepts only exact white canvas values', () => {
  assert.equal(isExactlyWhiteCssValue('#fff'), true);
  assert.equal(isExactlyWhiteCssValue('#FFFFFF'), true);
  assert.equal(isExactlyWhiteCssValue('white'), true);
  assert.equal(isExactlyWhiteCssValue('rgb(255, 255, 255)'), true);
  assert.equal(isExactlyWhiteCssValue('#f6f4ef'), false);
  assert.equal(isExactlyWhiteCssValue('rgba(255, 255, 255, .9)'), false);
  assert.equal(isExactlyWhiteCssValue(null), false);
});
