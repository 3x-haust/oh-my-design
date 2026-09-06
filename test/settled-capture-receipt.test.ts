import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import {
  validateSettledCaptureReceipt,
  type SettledCaptureReceipt,
} from '../core/evidence/settled-capture-receipt.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function png(width: number, height: number, marker: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[32] = marker;
  return bytes;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixture(): { root: string; receipt: SettledCaptureReceipt } {
  const root = mkdtempSync(join(tmpdir(), 'omd-settled-capture-'));
  roots.push(root);
  const main = png(390, 844, 1);
  const primaryMask = png(390, 844, 2);
  const targetMask = png(390, 844, 3);
  writeFileSync(join(root, 'main.png'), main);
  writeFileSync(join(root, 'primary-mask.png'), primaryMask);
  writeFileSync(join(root, 'target-mask.png'), targetMask);
  writeFileSync(join(root, 'skip-mask.png'), main);
  return {
    root,
    receipt: {
      schema: 'settled-capture-receipt-v1',
      screenshot: {
        path: 'main.png',
        sha256: sha256(main),
        mode: 'fixed-viewport',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        order: 4,
      },
      transition: {
        trigger: { kind: 'click', selector: '#next', order: 1 },
        signal: {
          kind: 'dom',
          selector: '#work',
          predicate: 'attached-visible',
          expected: null,
          subscribedOrder: 0,
          observedOrder: 2,
        },
      },
      settlement: {
        order: 3,
        rafCommitsBeforeAnimations: 2,
        finiteAnimations: { observed: 1, settled: 1, pending: 0 },
        rafCommitsAfterAnimations: 2,
        pendingAnimationFrameCallbacks: 0,
      },
      primary: {
        selector: '#work',
        computed: {
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          rect: { x: 0, y: 0, width: 390, height: 700 },
          textLength: 20,
        },
        maskedScreenshot: { path: 'primary-mask.png', sha256: sha256(primaryMask) },
      },
      target: {
        selector: '#review',
        computed: {
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          rect: { x: 16, y: 80, width: 358, height: 300 },
          textLength: 10,
        },
        maskedScreenshot: { path: 'target-mask.png', sha256: sha256(targetMask) },
      },
      skipLinks: [{
        selector: '.skip-link',
        focused: false,
        computed: {
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          rect: { x: 12, y: -67, width: 143, height: 44 },
          textLength: 5,
        },
        maskedScreenshot: { path: 'skip-mask.png', sha256: sha256(main) },
      }],
    },
  };
}

test('a fixed viewport receipt with ordered settlement and coherent masks passes', () => {
  const { root, receipt } = fixture();
  assert.deepEqual(validateSettledCaptureReceipt(root, receipt), []);
});

test('a full-page image cannot be presented as fixed-viewport proof', () => {
  const { root, receipt } = fixture();
  writeFileSync(join(root, 'main.png'), png(390, 1925, 1));
  const findings = validateSettledCaptureReceipt(root, {
    ...receipt,
    screenshot: { ...receipt.screenshot, sha256: sha256(png(390, 1925, 1)) },
  });
  assert.ok(findings.some(({ id }) => id === 'CAPTURE_PIXEL_DIMENSION_MISMATCH'));
});

test('subscription must precede trigger and observed signal', () => {
  const { root, receipt } = fixture();
  const findings = validateSettledCaptureReceipt(root, {
    ...receipt,
    transition: {
      ...receipt.transition,
      signal: { ...receipt.transition.signal, subscribedOrder: 2 },
    },
  });
  assert.ok(findings.some(({ id }) => id === 'CAPTURE_SIGNAL_ORDER_INVALID'));
});

test('pending animations or frames reject settlement', () => {
  const { root, receipt } = fixture();
  const findings = validateSettledCaptureReceipt(root, {
    ...receipt,
    settlement: {
      ...receipt.settlement,
      finiteAnimations: { observed: 2, settled: 1, pending: 1 },
      pendingAnimationFrameCallbacks: 1,
    },
  });
  assert.ok(findings.some(({ id }) => id === 'CAPTURE_NOT_SETTLED'));
});

test('computed visibility must describe an opaque nonempty target', () => {
  const { root, receipt } = fixture();
  const findings = validateSettledCaptureReceipt(root, {
    ...receipt,
    target: {
      ...receipt.target,
      computed: { ...receipt.target.computed, opacity: 0, textLength: 0 },
    },
  });
  assert.ok(findings.some(({ id }) => id === 'CAPTURE_COMPUTED_VISIBILITY_INVALID'));
});

test('an unfocused offscreen skip link cannot change viewport pixels', () => {
  const { root, receipt } = fixture();
  const changed = png(390, 844, 4);
  writeFileSync(join(root, 'skip-mask.png'), changed);
  const findings = validateSettledCaptureReceipt(root, {
    ...receipt,
    skipLinks: [{
      ...receipt.skipLinks[0]!,
      maskedScreenshot: { path: 'skip-mask.png', sha256: sha256(changed) },
    }],
  });
  assert.ok(findings.some(({ id }) => id === 'CAPTURE_PIXEL_GEOMETRY_CONTRADICTION'));
});

test('the capture CLI publishes the same strict gate', () => {
  const { root, receipt } = fixture();
  writeFileSync(join(root, 'receipt.json'), JSON.stringify(receipt));
  const result = spawnSync(process.execPath, [
    resolve('bin/omd.ts'),
    'capture',
    '--check',
    '--input',
    'receipt.json',
    '--json',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});
