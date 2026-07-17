import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { checkFrameUx } from '../core/frame/check-ux.ts';
import { writeFrameRecord } from '../core/frame/write.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-frame-ux-'));
const validTaskMatrix = 'T1 | goal: Complete a purchase | start: cart | actions: review and pay | success: confirmation | recovery: edit address | viewports: desktop, mobile | requirements: invalid-submit, transient';

/** Write a frame.md with arbitrary frontmatter and body directly so incomplete and
 *  malformed task coverage records can be tested precisely. */
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
  // Only uxTask is present; the remaining UX anchors are missing.
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

test('FRAME-UX-INCOMPLETE does not fire when all four UX fields are present for marketing', () => {
  const cwd = project();
  writeRawFrame(cwd, {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'User wants to read the campaign',
    uxFrequentAction: 'Read the campaign story',
    uxCostliestError: 'Missed legal disclaimer — recovery path: prominent footer link',
    uxSurface: 'marketing',
  });
  const violations = checkFrameUx(cwd);
  assert.equal(violations.length, 0, 'marketing does not require a task coverage matrix');
});

test('FRAME-UX-INCOMPLETE accepts stable task coverage rows for product and mixed surfaces', () => {
  for (const surface of ['product', 'mixed']) {
    const cwd = project();
    const matrix = surface === 'product'
      ? validTaskMatrix
      : validTaskMatrix.replace('recovery: edit address', 'recovery: N/A: recovery is not applicable');
    writeRawFrame(cwd, {
      why: 'test evidence here',
      writtenAt: new Date().toISOString(),
      uxTask: 'Complete a purchase',
      uxFrequentAction: 'Add item to cart',
      uxCostliestError: 'Wrong address — recover by editing before checkout',
      uxSurface: surface,
    }, `## Task coverage matrix\n\n${matrix}`);
    assert.equal(checkFrameUx(cwd).length, 0, `${surface} accepts a stable task coverage row`);
  }
});

test('FRAME-UX-INCOMPLETE requires a matrix section and stable rows for product and mixed surfaces', () => {
  for (const surface of ['product', 'mixed']) {
    for (const [caseName, body] of [
      ['missing matrix', 'test body'],
      ['matrix without stable rows', '## Task coverage matrix\n\nNo stable rows here'],
    ]) {
      const cwd = project();
      writeRawFrame(cwd, {
        why: 'test evidence here',
        writtenAt: new Date().toISOString(),
        uxTask: 'Complete a purchase',
        uxFrequentAction: 'Add item to cart',
        uxCostliestError: 'Wrong address — recover by editing before checkout',
        uxSurface: surface,
      }, body);
      const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
      assert.ok(violation, `${surface} with ${caseName} should warn`);
      assert.match(String(violation.value), /taskCoverageMatrix \(--task-matrix:/);
      assert.match(violation.message, /--task-matrix/);
    }
  }
});
test('FRAME-UX-INCOMPLETE rejects invalid surfaces and malformed task coverage rows', () => {
  const frame = {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'Complete a purchase',
    uxFrequentAction: 'Add item to cart',
    uxCostliestError: 'Wrong address — recover by editing before checkout',
    uxSurface: 'product',
  };

  const cases: Array<{ caseName: string; surface: string; matrix?: string; expected: RegExp }> = [
    { caseName: 'unknown surface', surface: 'prodcut', expected: /uxSurface/ },
    { caseName: 'duplicate IDs', surface: 'product', matrix: `${validTaskMatrix}\nT1 | goal: Buy again | start: cart | actions: pay | success: confirmation | recovery: contact support | viewports: mobile | requirements: none`, expected: /duplicate task coverage id: T1/ },
    { caseName: 'bare ID', surface: 'product', matrix: 'T1', expected: /malformed task coverage row/ },
    { caseName: 'recovery N/A without reason', surface: 'product', matrix: 'T1 | goal: Buy | start: cart | actions: pay | success: confirmation | recovery: N/A | viewports: desktop | requirements: none', expected: /N\/A requires a reason/ },
  ];
  for (const { caseName, surface, matrix, expected } of cases) {
    const cwd = project();
    writeRawFrame(cwd, { ...frame, uxSurface: surface }, matrix ? `## Task coverage matrix\n\n${matrix}` : 'test body');
    const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
    assert.ok(violation, `${caseName} should warn`);
    assert.match(String(violation.value), expected);
    if (caseName === 'unknown surface') {
      assert.match(String(violation.value), /taskCoverageMatrix/);
    }
  }
});

test('FRAME-UX-INCOMPLETE rejects a missing value for every task coverage field', () => {
  for (const field of ['goal', 'start', 'actions', 'success', 'recovery', 'viewports', 'requirements']) {
    const cwd = project();
    const matrix = validTaskMatrix.replace(new RegExp(`${field}: [^|]*`), `${field}: `);
    writeRawFrame(cwd, {
      why: 'test evidence here',
      writtenAt: new Date().toISOString(),
      uxTask: 'Complete a purchase',
      uxFrequentAction: 'Add item to cart',
      uxCostliestError: 'Wrong address — recover by editing before checkout',
      uxSurface: 'product',
    }, `## Task coverage matrix\n\n${matrix}`);
    const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
    assert.ok(violation, `${field} should be required`);
    assert.match(String(violation.value), new RegExp(`T1 is missing ${field}`));
  }
});
test('FRAME-UX-INCOMPLETE permits reasoned N/A only for recovery', () => {
  for (const field of ['goal', 'start', 'actions', 'success', 'viewports', 'requirements']) {
    const cwd = project();
    const matrix = validTaskMatrix.replace(new RegExp(`${field}: [^|]*`), `${field}: N/A: not applicable`);
    writeRawFrame(cwd, {
      why: 'test evidence here',
      writtenAt: new Date().toISOString(),
      uxTask: 'Complete a purchase',
      uxFrequentAction: 'Add item to cart',
      uxCostliestError: 'Wrong address — recover by editing before checkout',
      uxSurface: 'product',
    }, `## Task coverage matrix\n\n${matrix}`);
    const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
    assert.ok(violation, `${field} N/A should warn`);
    assert.match(String(violation.value), new RegExp(`T1 ${field} must not be N/A`));
  }

  const cwd = project();
  const matrix = validTaskMatrix.replace('recovery: edit address', 'recovery: N/A: no recovery action exists');
  writeRawFrame(cwd, {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'Complete a purchase',
    uxFrequentAction: 'Add item to cart',
    uxCostliestError: 'Wrong address — recover by editing before checkout',
    uxSurface: 'product',
  }, `## Task coverage matrix\n\n${matrix}`);
  assert.equal(checkFrameUx(cwd).length, 0, 'reasoned recovery N/A should be accepted');
});
test('FRAME-UX-INCOMPLETE validates task viewports and requirements exactly', () => {
  const frame = {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'Complete a purchase',
    uxFrequentAction: 'Add item to cart',
    uxCostliestError: 'Wrong address — recover by editing before checkout',
    uxSurface: 'product',
  };
  const cases = [
    ['duplicate viewport', validTaskMatrix.replace('desktop, mobile', 'desktop, desktop'), /viewports contains duplicate value: desktop/],
    ['unknown viewport', validTaskMatrix.replace('desktop, mobile', 'tablet'), /viewports contains unknown value: tablet/],
    ['malformed viewport list', validTaskMatrix.replace('desktop, mobile', 'desktop,, mobile'), /viewports must be a comma-separated list/],
    ['duplicate requirement', validTaskMatrix.replace('invalid-submit, transient', 'invalid-submit, invalid-submit'), /requirements contains duplicate value: invalid-submit/],
    ['malformed requirement list', validTaskMatrix.replace('invalid-submit, transient', 'invalid-submit,, transient'), /requirements must be a comma-separated list/],
    ['unknown requirement', validTaskMatrix.replace('invalid-submit, transient', 'mobile'), /requirements contains unknown value: mobile/],
    ['contradictory requirements', validTaskMatrix.replace('invalid-submit, transient', 'none, transient'), /requirements none cannot be combined/],
  ] as const;

  for (const [caseName, matrix, expected] of cases) {
    const cwd = project();
    writeRawFrame(cwd, frame, `## Task coverage matrix\n\n${matrix}`);
    const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
    assert.ok(violation, `${caseName} should warn`);
    assert.match(String(violation.value), expected);
  }

  const cwd = project();
  writeRawFrame(cwd, frame, `## Task coverage matrix\n\n${validTaskMatrix.replace('invalid-submit, transient', 'none')}`);
  assert.equal(checkFrameUx(cwd).length, 0, 'requirements: none should be accepted');
});

test('FRAME-UX-INCOMPLETE rejects duplicate task coverage matrix headings', () => {
  for (const surface of ['product', 'mixed']) {
    const cwd = project();
    writeRawFrame(cwd, {
      why: 'test evidence here',
      writtenAt: new Date().toISOString(),
      uxTask: 'Complete a purchase',
      uxFrequentAction: 'Add item to cart',
      uxCostliestError: 'Wrong address — recover by editing before checkout',
      uxSurface: surface,
    }, `## Task coverage matrix\n\n${validTaskMatrix}\n\n## Task coverage matrix\n\nT1`);
    const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
    assert.ok(violation, `${surface} should reject duplicate matrix headings`);
    assert.match(String(violation.value), /requires exactly one section; found 2/);
  }
});

test('FRAME-UX-INCOMPLETE rejects task coverage matrices on non-product surfaces', () => {
  for (const surface of ['marketing', 'editorial']) {
    const cwd = project();
    writeRawFrame(cwd, {
      why: 'test evidence here',
      writtenAt: new Date().toISOString(),
      uxTask: 'Read the campaign',
      uxFrequentAction: 'Read the campaign story',
      uxCostliestError: 'Missed legal disclaimer — recover through the footer',
      uxSurface: surface,
    }, `## Task coverage matrix\n\n${validTaskMatrix}`);
    const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
    assert.ok(violation, `${surface} should reject matrix contamination`);
    assert.match(String(violation.value), /not allowed for marketing or editorial surfaces/);
  }
});

test('FRAME-UX-INCOMPLETE rejects array and object surfaces without coercion', () => {
  for (const value of [['product'], { value: 'product' }]) {
    const cwd = project();
    writeRawFrame(cwd, {
      why: 'test evidence here',
      writtenAt: new Date().toISOString(),
      uxTask: 'Complete a purchase',
      uxFrequentAction: 'Add item to cart',
      uxCostliestError: 'Wrong address — recover by editing before checkout',
      uxSurface: value,
    }, `## Task coverage matrix\n\n${validTaskMatrix}`);
    const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
    assert.ok(violation, 'non-string surface should warn');
    assert.match(String(violation.value), /uxSurface/);
  }
});

test('FRAME-UX-INCOMPLETE normalizes surface casing before requiring a matrix', () => {
  const cwd = project();
  writeRawFrame(cwd, {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'Complete a purchase',
    uxFrequentAction: 'Add item to cart',
    uxCostliestError: 'Wrong address — recover by editing before checkout',
    uxSurface: 'PrOdUcT',
  }, `## Task coverage matrix\n\n${validTaskMatrix}`);
  assert.equal(checkFrameUx(cwd).length, 0);
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
test('FRAME-UX-INCOMPLETE rejects array and object values for every UX anchor', () => {
  const anchors = ['uxTask', 'uxFrequentAction', 'uxCostliestError'] as const;
  const frame = {
    why: 'test evidence here',
    writtenAt: new Date().toISOString(),
    uxTask: 'User wants to book a flight',
    uxFrequentAction: 'Search for available routes',
    uxCostliestError: 'Double booking — recovery path: 24h free cancellation',
    uxSurface: 'marketing',
  };

  for (const anchor of anchors) {
    for (const value of [['valid anchor'], { value: 'valid anchor' }]) {
      const cwd = project();
      writeRawFrame(cwd, { ...frame, [anchor]: value });
      const violation = checkFrameUx(cwd).find((v) => v.id === 'FRAME-UX-INCOMPLETE');
      assert.ok(violation, `${anchor} ${Array.isArray(value) ? 'array' : 'object'} should warn`);
      assert.match(String(violation.value), new RegExp(`${anchor} \\(`));
    }
  }
});

test('writeFrameRecord writes one durable task coverage matrix section', () => {
  const cwd = project();
  mkdirSync(join(cwd, '.omd'), { recursive: true });
  writeFrameRecord(cwd, {
    problem: 'Users cannot find the checkout button',
    reframe: 'This is a visual hierarchy problem, not a discovery problem',
    why: 'Support tickets show 40% of users ask "where do I pay" (Zendesk Q3)',
    uxTask: 'Complete a purchase',
    uxFrequentAction: 'Add item to cart',
    uxCostliestError: 'Checkout with wrong address — recovery requires order cancellation',
    uxSurface: 'MiXeD',
    taskCoverageMatrix: `## Task coverage matrix\n\n${validTaskMatrix}`,
  });
  const frame = readFileSync(join(cwd, '.omd', 'frame.md'), 'utf8');
  assert.equal((frame.match(/^## Task coverage matrix$/gm) ?? []).length, 1);
  assert.match(frame, /^uxSurface: mixed$/m);
  assert.match(frame, /^T1 \| goal: Complete a purchase/m);
  assert.equal(checkFrameUx(cwd).length, 0, 'matrix written by writeFrameRecord should satisfy the check');
});
test('writeFrameRecord rejects supplied invalid UX surface and task coverage matrix', () => {
  const base = {
    problem: 'Users cannot find the checkout button',
    reframe: 'This is a visual hierarchy problem, not a discovery problem',
    why: 'Support tickets show 40% of users ask "where do I pay" (Zendesk Q3)',
  };

  assert.throws(() => writeFrameRecord(project(), { ...base, uxSurface: 'prodcut' }), /uxSurface must be/);
  assert.throws(() => writeFrameRecord(project(), {
    ...base,
    uxSurface: 'product',
    taskCoverageMatrix: 'T1',
  }), /Invalid task coverage matrix/);
  assert.throws(() => writeFrameRecord(project(), { ...base, uxSurface: 'mixed' }), /require a valid task coverage matrix/);
});
test('writeFrameRecord rejects matrices on non-product surfaces and non-string surfaces', () => {
  const base = {
    problem: 'Users cannot find the checkout button',
    reframe: 'This is a visual hierarchy problem, not a discovery problem',
    why: 'Support tickets show 40% of users ask "where do I pay" (Zendesk Q3)',
  };

  for (const uxSurface of ['marketing', 'editorial']) {
    assert.throws(() => writeFrameRecord(project(), {
      ...base,
      uxSurface,
      taskCoverageMatrix: validTaskMatrix,
    }), /must not include a task coverage matrix/);
  }
  for (const uxSurface of [['product'], { toString: () => 'product' }]) {
    assert.throws(() => writeFrameRecord(project(), { ...base, uxSurface }), /uxSurface must be/);
  }
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
