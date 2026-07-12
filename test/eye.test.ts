import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { extractIr, parseViewport } from '../core/render/index.ts';
import { normalize } from '../core/ir/normalize.ts';
import { loadRules, check } from '../core/rules/engine.ts';
import { must } from './helpers.ts';

const PAGE = fileURLToPath(new URL('./fixtures/page.html', import.meta.url));
const rules = loadRules(fileURLToPath(new URL('../core/rules/builtin/', import.meta.url)));

const seen = await extractIr(PAGE, { viewport: parseViewport('390x844') });
const ir = normalize(seen);
const violations = check(ir, rules);
const at = (cls: string) => violations.filter((v) => v.path.endsWith(cls));

test('the eye reads CSS custom properties as design tokens', () => {
  assert.deepEqual(seen.tokens, { surface: '#FFFFFF', ink: '#111111', brand: '#FF5A1F' });
});

test('a tokenised, on-grid, accessible card produces no findings', () => {
  assert.deepEqual(at('div.card-good'), []);
});

test('a hardcoded fill and an off-grid padding are both caught', () => {
  assert.deepEqual(at('div.card-bad').map((v) => v.id).sort(), ['SPACING-001', 'TOKEN-003']);
});

test('grey-on-grey and a 38px tall button are both caught', () => {
  const ids = at('button.pay').map((v) => v.id).sort();
  assert.ok(ids.includes('CONTRAST-001'));
  assert.ok(ids.includes('HIT-002'));
});

// The browser's default button padding is 1px 6px. Nobody wrote it, so it is not a
// design decision, and reporting it as an 8pt-grid defect is noise that trains
// designers to ignore the tool.
test('user-agent defaults are not reported as defects', () => {
  const spacing = at('button.pay').filter((v) => v.id === 'SPACING-001');
  assert.deepEqual(spacing, [], 'UA default padding must not be a finding');
});

test('inline links are exempt from the 44px target rule', () => {
  const inline = ir.nodes.filter((n) => n.inline && n.computed.isInteractive);
  for (const n of inline) assert.equal(check(ir, rules).filter((v) => v.nodeId === n.id && v.id === 'HIT-002').length, 0);
});

test('contrast is measured against the painted backdrop, inherited if transparent', () => {
  const pay = must(ir.nodes.find((n) => n.path.endsWith('button.pay')), 'pay');
  assert.ok(Math.abs(must(pay.computed.contrastWithParent, 'contrastWithParent') - 3.03) < 0.02);
  const good = must(ir.nodes.find((n) => n.path.endsWith('div.card-good')), 'good');
  assert.ok(must(good.fill, 'fill').value === '#FFFFFF');
});

// slop is orthogonal to defects: a page can be fully accessible and still be generic.
const SLOP_PAGE = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));
const CONSIDERED_PAGE = fileURLToPath(new URL('./fixtures/considered.html', import.meta.url));

const slopIr = normalize(await extractIr(SLOP_PAGE, { viewport: parseViewport('390x844') }));
const slopViolations = check(slopIr, rules);

const consideredIr = normalize(await extractIr(CONSIDERED_PAGE, { viewport: parseViewport('390x844') }));
const consideredViolations = check(consideredIr, rules);

test('slop.html is clean on a11y — slop is orthogonal to defects', () => {
  const a11y = check(slopIr, rules, { categories: ['a11y'] });
  assert.deepEqual(a11y, []);
});

test('slop.html fires every slop heuristic', () => {
  const ids = new Set(slopViolations.filter((v) => v.category === 'slop').map((v) => v.id));
  assert.deepEqual(
    [...ids].sort(),
    [
      'SLOP-COPY',
      'SLOP-EMOJI-HEADING',
      'SLOP-EVERYTHING-CENTERED',
      'SLOP-GRADIENT',
      'SLOP-NESTED-RADIUS',
      'SLOP-RADIUS-MONOCULTURE',
      'SLOP-SHADOW-MONOCULTURE',
      'SLOP-TRIPLE-CARD',
    ],
  );
});

test('considered.html — a deliberate design with a point of view — produces zero slop violations', () => {
  const slop = consideredViolations.filter((v) => v.category === 'slop');
  assert.deepEqual(
    slop,
    [],
    `slop false-positived: ${slop.map((v) => `${v.id} (${v.path}): ${v.message}`).join('; ')}`,
  );
});

test('check(..., { categories: ["slop"] }) returns only slop violations', () => {
  const v = check(slopIr, rules, { categories: ['slop'] });
  assert.ok(v.length > 0);
  for (const violation of v) assert.equal(violation.category, 'slop');
});
