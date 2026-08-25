import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { normalize } from '../core/ir/normalize.ts';
import { extractInvariants } from '../core/ref/invariants.ts';
import { extractIr } from '../core/render/index.ts';
import {
  SELECTED_REFERENCE_DISTANCE_PATH,
  parseSelectedReferenceDistanceReceipt,
} from '../core/ref/selected-reference-distance.ts';
import { createSelectedReferenceFixture } from './helpers/selected-reference-fixture.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const PASS_PAGE = fileURLToPath(new URL('./fixtures/reference-fidelity/pass.html', import.meta.url));
const FAIL_PAGE = fileURLToPath(new URL('./fixtures/reference-fidelity/fail.html', import.meta.url));
const VIEWPORT = { width: 1440, height: 900 } as const;

const run = (root: string, target: string) => spawnSync(process.execPath, [
  CLI,
  'ref',
  'distance',
  target,
  '--selected',
  '--gate',
  '--json',
  '--viewport',
  `${VIEWPORT.width}x${VIEWPORT.height}`,
], { cwd: root, encoding: 'utf8', env: process.env });

test('selected reference CLI gates assigned selectors and preserves stale diagnostics', async (context) => {
  const passIr = await extractIr(PASS_PAGE, {
    viewport: VIEWPORT,
    selector: '[data-omd="shop-hero"]',
  });
  const fixture = createSelectedReferenceFixture(context, {
    invariants: extractInvariants(normalize(passIr)),
    viewport: VIEWPORT,
  });

  const passing = run(fixture.root, PASS_PAGE);
  assert.equal(passing.status, 0, passing.stderr);
  const passReceipt = parseSelectedReferenceDistanceReceipt(JSON.parse(passing.stdout));
  assert.equal(passReceipt.verdict, 'pass');
  assert.deepEqual(passReceipt.comparisons.map((row) => ({
    slotId: row.slotId,
    targetSelector: row.targetSelector,
  })), [{
    slotId: 'hero-card',
    targetSelector: '[data-omd="shop-hero"]',
  }]);
  assert.equal(
    parseSelectedReferenceDistanceReceipt(JSON.parse(readFileSync(
      `${fixture.root}/${SELECTED_REFERENCE_DISTANCE_PATH}`,
      'utf8',
    ))).verdict,
    'pass',
  );

  const failing = run(fixture.root, FAIL_PAGE);
  assert.equal(failing.status, 1, failing.stderr);
  assert.equal(
    parseSelectedReferenceDistanceReceipt(JSON.parse(failing.stdout)).verdict,
    'fail',
  );

  const restored = run(fixture.root, PASS_PAGE);
  assert.equal(restored.status, 0, restored.stderr);
  const receiptPath = `${fixture.root}/${SELECTED_REFERENCE_DISTANCE_PATH}`;
  const currentReceipt = readFileSync(receiptPath);
  const selectionPath = `${fixture.root}/.omd/reference-selection-v2.json`;
  writeFileSync(selectionPath, `${readFileSync(selectionPath, 'utf8')}\n`);

  const stale = run(fixture.root, PASS_PAGE);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /selection|settlement|canonical|stale/i);
  assert.deepEqual(readFileSync(receiptPath), currentReceipt);
});
