import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { browserEvaluationExpression } from '../core/render/index.ts';

function isIsolatedReferenceError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'ReferenceError';
}

test('Given a transpiled page function with __name When it is wrapped for browser evaluation Then the local helper preserves the callback result', () => {
  // Given: esbuild-style source and an isolated page-like realm without Node globals.
  const source = 'function pageCallback(value) { const read = __name((input) => input, "read"); return read(value); }';
  const context = {};
  assert.equal(runInNewContext('typeof __name', context), 'undefined');

  // When: the source becomes a browser evaluation expression.
  const expression = browserEvaluationExpression(source, JSON.stringify('measured'));

  // Then: the wrapper supplies only the supported local helper and returns the page value.
  assert.equal(runInNewContext(expression, context), 'measured');
});

test('Given an unknown legal helper identifier When it executes in the isolated browser realm Then it fails closed with ReferenceError', () => {
  // Given: a valid identifier the wrapper does not define.
  const source = 'function pageCallback() { return __1; }';

  // When: the page-like realm executes the serialized callback.
  const expression = browserEvaluationExpression(source, '');

  // Then: the missing helper stays unbound rather than receiving a permissive global shim.
  assert.throws(() => runInNewContext(expression, {}), isIsolatedReferenceError);
});

test('Given helper-shaped text, comments, and property names When it is wrapped Then ordinary page code evaluates without a false rejection', () => {
  // Given: non-helper occurrences that must remain ordinary JavaScript syntax and data.
  const source = 'function pageCallback() { const obj = { __futureHelper: "property" }; /* __futureHelper */ const quoted = "__futureHelper"; return `${obj.__futureHelper}:${quoted}`; }';

  // When: the page-like realm evaluates its serialized function.
  const expression = browserEvaluationExpression(source, '');

  // Then: property access, comments, and quoted text do not trigger wrapper policy.
  assert.equal(runInNewContext(expression, {}), 'property:__futureHelper');
});
