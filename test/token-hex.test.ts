import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { extractIr, parseViewport } from '../core/render/index.ts';

// Regression guard for the token->name inversion in core/ir/dom.ts. A production minifier
// (Vite/esbuild) collapses a repeating 6-digit custom property (--surface: #ffffff) to its
// 3-digit form (#fff). A consumer's computed background still resolves to 6-digit via toHex,
// so the inversion must expand the shorthand before comparing or it drops the token name.
const FIXTURE = fileURLToPath(new URL('./fixtures/token-hex.html', import.meta.url));
const viewport = parseViewport('390x844');

test('a minified 3-digit design token still resolves to its 6-digit value and name', async () => {
  const ir = await extractIr(FIXTURE, { viewport });

  // Positive: the shorthand --surface: #fff is expanded to the canonical 6-digit form, so it
  // matches the consumer's computed #FFFFFF and keeps its token identity.
  assert.equal(ir.tokens?.surface, '#FFFFFF');
  assert.ok(
    ir.nodes.some((node) => node.fill?.token === 'surface'),
    'a consumer of the minified token must carry the token name, not a false mismatch',
  );

  // Control: an already 6-digit token with distinct channels is unaffected by the expansion.
  assert.equal(ir.tokens?.brand, '#1F9D55');
  assert.ok(ir.nodes.some((node) => node.fill?.token === 'brand'));
});

test('expanding token shorthand does not fabricate a token name for a hand-typed literal', async () => {
  const ir = await extractIr(FIXTURE, { viewport });
  const literal = ir.nodes.filter((node) => node.fill?.value === '#FEFEFE');
  assert.ok(literal.length > 0, 'the hand-typed #fefefe surface must be captured');
  assert.ok(
    literal.every((node) => node.fill?.token === null),
    'a non-token literal must stay token: null even after shorthand expansion',
  );
});
