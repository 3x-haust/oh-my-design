import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { checkFrameUx } from '../core/frame/check-ux.ts';
import { writeFrameRecord } from '../core/frame/write.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-frame-ux-'));

/** Write a frame.md with arbitrary frontmatter directly, bypassing writeFrameRecord
 *  so we can test incomplete frames (which writeFrameRecord would not produce). */
function writeRawFrame(cwd: string, frontmatter: Record<string, unknown>, body = 'test body'): void {
  const omd = join(cwd, '.omd');
  mkdirSync(omd, { recursive: true });
  writeFileSync(join(omd, 'frame.md'), `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body}\n`);
}

// ── FRAME-UX-INCOMPLETE ───────────────────────────────────────────────────────

test('FRAME-UX-INCOMPLETE does not fire when frame.md does not exist', () => {
  const cwd = project();
  const violations = checkFrameUx(cwd);
  assert.equal(violations.length, 0, 'no frame.md — no violation');
});

test('FRAME-UX-INCOMPLETE fires when all four UX fields are missing', () => {
  const cwd = project();
  writeRawFrame(cwd, { why: 'test evidence here', writtenAt: new Date().toISOString() });
  const violations = checkFrameUx(cwd);
  assert.ok(violations.some((v) => v.id === 'FRAME-UX-INCOMPLETE'), 'expected FRAME-UX-INCOMPLETE');
  const v = violations.find((x) => x.id === 'FRAME-UX-INCOMPLETE')!;
  // All four fields should be listed in the value
  assert.ok(String(v.value).includes('uxTask'), 'value should mention uxTask');
  assert.ok(String(v.value).includes('uxFrequentAction'), 'value should mention uxFrequentAction');
  assert.ok(String(v.value).includes('uxCostliestError'), 'value should mention uxCostliestError');
  assert.ok(String(v.value).includes('uxSurface'), 'value should mention uxSurface');
});

test('FRAME-UX-INCOMPLETE fires for each individual missing field', () => {
  const cwd = project();
  // Only uxTask is present; the other two are missing
  writeRawFrame(cwd, {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'User wants to book a flight',
  });
  const violations = checkFrameUx(cwd);
  assert.ok(violations.some((v) => v.id === 'FRAME-UX-INCOMPLETE'));
  const v = violations.find((x) => x.id === 'FRAME-UX-INCOMPLETE')!;
  assert.ok(!String(v.value).includes('uxTask ('), 'uxTask is present — should not be in the missing list');
  assert.ok(String(v.value).includes('uxFrequentAction'), 'uxFrequentAction should be listed as missing');
  assert.ok(String(v.value).includes('uxCostliestError'), 'uxCostliestError should be listed as missing');
  assert.ok(String(v.value).includes('uxSurface'), 'uxSurface should be listed as missing');
});

test('FRAME-UX-INCOMPLETE does not fire when all four UX fields are present', () => {
  const cwd = project();
  writeRawFrame(cwd, {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'User wants to book a flight',
    uxFrequentAction: 'Search for available routes',
    uxCostliestError: 'Double booking — recovery path: 24h free cancellation',
    uxSurface: 'product',
  });
  const violations = checkFrameUx(cwd);
  assert.equal(violations.length, 0, 'all four fields present — no violation');
});

test('FRAME-UX-INCOMPLETE fires when only uxSurface is missing', () => {
  const cwd = project();
  writeRawFrame(cwd, {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'User wants to book a flight',
    uxFrequentAction: 'Search for available routes',
    uxCostliestError: 'Double booking — recovery path: 24h free cancellation',
  });
  const violations = checkFrameUx(cwd);
  const v = violations.find((x) => x.id === 'FRAME-UX-INCOMPLETE');
  assert.ok(v, 'missing uxSurface alone should fire');
  assert.ok(String(v!.value).includes('uxSurface'), 'uxSurface should be the missing field');
  assert.ok(!String(v!.value).includes('uxTask ('), 'uxTask present — not in missing list');
});

test('FRAME-UX-INCOMPLETE fires when a field is present but empty', () => {
  const cwd = project();
  writeRawFrame(cwd, {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: '   ', // whitespace-only counts as empty
    uxFrequentAction: 'Search for routes',
    uxCostliestError: 'Double booking',
    uxSurface: 'product',
  });
  const violations = checkFrameUx(cwd);
  assert.ok(violations.some((v) => v.id === 'FRAME-UX-INCOMPLETE'), 'whitespace-only task should fire');
  const v = violations.find((x) => x.id === 'FRAME-UX-INCOMPLETE')!;
  assert.ok(String(v.value).includes('uxTask'), 'whitespace-only uxTask should be listed as missing');
});

test('writeFrameRecord stores UX fields in frontmatter', () => {
  const cwd = project();
  mkdirSync(join(cwd, '.omd'), { recursive: true });
  writeFrameRecord(cwd, {
    problem: 'Users cannot find the checkout button',
    reframe: 'This is a visual hierarchy problem, not a discovery problem',
    why: 'Support tickets show 40% of users ask "where do I pay" (Zendesk Q3)',
    uxTask: 'Complete a purchase',
    uxFrequentAction: 'Add item to cart',
    uxCostliestError: 'Checkout with wrong address — recovery requires order cancellation',
    uxSurface: 'mixed',
  });
  // After writing, checkFrameUx should find all fields complete
  const violations = checkFrameUx(cwd);
  assert.equal(violations.length, 0, 'UX fields written by writeFrameRecord should satisfy the check');
});

test('FRAME-UX-INCOMPLETE has category ux and severity warn', () => {
  const cwd = project();
  writeRawFrame(cwd, { why: 'test evidence here', writtenAt: new Date().toISOString() });
  const violations = checkFrameUx(cwd);
  const v = violations.find((x) => x.id === 'FRAME-UX-INCOMPLETE');
  assert.ok(v, 'violation should exist');
  assert.equal(v!.category, 'ux');
  assert.equal(v!.severity, 'warn');
});

test('FRAME-UX-INCOMPLETE backward compat: old frame without UX fields fires the check', () => {
  // A frame written before uxTask/uxFrequentAction/uxCostliestError were introduced
  // should fire FRAME-UX-INCOMPLETE, not throw or silently pass.
  const cwd = project();
  writeRawFrame(cwd, {
    why: 'old evidence from before the UX fields were added',
    writtenAt: '2024-01-01T00:00:00.000Z',
    // No uxTask, uxFrequentAction, uxCostliestError
  });
  const violations = checkFrameUx(cwd);
  assert.ok(violations.some((v) => v.id === 'FRAME-UX-INCOMPLETE'), 'old frame without UX fields should fire');
});
