import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalize } from '../core/ir/normalize.ts';
import { check, loadRules } from '../core/rules/engine.ts';
import { validateColourRoles } from '../core/composition-contract/index.ts';
import { extractIr, parseViewport } from '../core/render/index.ts';
import type { RawNode } from '../core/types.ts';

const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);
const fixture = fileURLToPath(new URL('./fixtures/palette-roles.html', import.meta.url));

const root = (children: string[]): RawNode => ({
  id: 'root',
  name: 'Root',
  type: 'FRAME',
  path: 'Root',
  parent: null,
  box: { x: 0, y: 0, w: 390, h: 844 },
  children,
});

const painted = (
  id: string,
  property: 'background' | 'border' | 'text',
  value: string,
  token: string,
  semanticRole: 'success' | 'error' | null = null,
): RawNode => {
  const node: RawNode = {
    id,
    name: id,
    type: property === 'text' ? 'TEXT' : 'FRAME',
    path: `Root/${id}`,
    parent: 'root',
    box: { x: 0, y: 0, w: 100, h: 44 },
    children: [],
    paintColors: [{ property, value, token, semanticRole }],
  };
  if (property === 'text') node.text = id;
  return node;
};

test('diffuse accent catches coral, lime, and blue across computed CSS-variable paints', () => {
  const ir = normalize({
    nodes: [
      root(['coral', 'lime', 'blue']),
      painted('coral', 'background', '#FF5B55', 'coral'),
      painted('lime', 'border', '#D8FF45', 'lime'),
      painted('blue', 'text', '#3E63DD', 'focus'),
    ],
  });
  const findings = check(ir, builtin, { categories: ['slop'] });
  assert.ok(findings.some((finding) => finding.id === 'SLOP-DIFFUSE-ACCENT'));
});

test('browser IR retains resolved CSS-variable paints, properties, tokens, and explicit semantics', async () => {
  const ir = await extractIr(fixture, { viewport: parseViewport('390x844') });
  const paints = ir.nodes.flatMap((node) => node.paintColors ?? []);
  assert.ok(paints.some((paint) => paint.property === 'background' && paint.value === '#FF5B55' && paint.token === 'coral'));
  assert.ok(paints.some((paint) => paint.property === 'border' && paint.value === '#D8FF45' && paint.token === 'lime'));
  assert.ok(paints.some((paint) => paint.property === 'text' && paint.value === '#3E63DD' && paint.token === 'blue'));
  assert.ok(paints.some((paint) => paint.value === '#FF5B55' && paint.semanticRole === 'error'));
  assert.ok(paints.some((paint) => paint.value === '#D8FF45' && paint.semanticRole === 'success'));
});

test('explicit success and error paints do not consume the single product accent allowance', () => {
  const ir = normalize({
    nodes: [
      root(['error', 'success', 'accent']),
      painted('error', 'background', '#FF5B55', 'error', 'error'),
      painted('success', 'border', '#2E8B57', 'success', 'success'),
      painted('accent', 'text', '#3E63DD', 'accent'),
    ],
  });
  const findings = check(ir, builtin, { categories: ['slop'] });
  assert.ok(!findings.some((finding) => finding.id === 'SLOP-DIFFUSE-ACCENT'));
});

test('colour-role contract requires one dominant, secondary, accent, success, and error row', () => {
  const valid = [
    '| Role | Token/value | Intended use |',
    '| --- | --- | --- |',
    '| Dominant | `--canvas` / `#FFFFFF` | Page canvas |',
    '| Secondary | `--surface` / `#F4F5F7` | Grouped surfaces |',
    '| Accent | `--accent` / `#2457FF` | Primary action and selected state |',
    '| Semantic success | `--success` / `#18794E` | Success feedback only |',
    '| Semantic error | `--error` / `#C62A2F` | Error feedback only |',
  ];
  assert.deepEqual(validateColourRoles(valid), []);
  assert.match(
    validateColourRoles(valid.filter((line) => !line.includes('| Accent |'))).join('\n'),
    /Accent/,
  );
});

test('current composition publication schema adds machine-validated colour roles without rewriting the legacy ABI', async () => {
  const module = await import('../core/composition-contract/index.ts');
  assert.equal(module.COMPOSITION_SECTIONS.join('\n').includes('Colour roles'), false);
  assert.ok(module.CURRENT_COMPOSITION_SECTIONS.includes('Colour roles'));
});

test('colour-role contract rejects duplicate, unknown, placeholder, and decorative accent roles', () => {
  const invalid = [
    '| Role | Token/value | Intended use |',
    '| --- | --- | --- |',
    '| Dominant | TBD | Page canvas |',
    '| Dominant | `--other` / `#FFFFFF` | Another canvas |',
    '| Secondary | `--surface` / `#F4F5F7` | Grouped surfaces |',
    '| Accent | `--accent` / `#2457FF` | Decorative labels |',
    '| Semantic success | none | Success feedback only |',
    '| Semantic error | none | Error feedback only |',
    '| Tertiary | `--extra` / `#FF00FF` | Decoration |',
  ];
  const message = validateColourRoles(invalid).join('\n');
  assert.match(message, /duplicate.*Dominant/i);
  assert.match(message, /unknown.*Tertiary/i);
  assert.match(message, /placeholder.*Dominant/i);
  assert.match(message, /primary action|critical|selected/i);
});
