import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import { isCallExpression, isPropertyAccessExpression, isIdentifier, isObjectLiteralExpression, isPropertyAssignment, SyntaxKind, type Node } from 'typescript/unstable/ast';

// Render/verification stay headless. Product policy now permits only the consent-bound browse
// persistent profile launcher to be headed; reference-browse-modes tests its executable gate.

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.ts')) out.push(path);
  }
}

const sources = (() => {
  const files: string[] = [];
  for (const d of ['core', 'bin', 'adapters']) walk(join(root, d), files);
  return files.map((f) => ({ f, text: readFileSync(f, 'utf8') }));
})();

test('every chromium.launch( in the codebase requests headless: true', () => {
  const launchRe = /chromium\.launch\(([^)]*)\)/g;
  for (const { f, text } of sources) {
    for (const m of text.matchAll(launchRe)) {
      const args = m[1] ?? '';
      assert.match(args, /headless:\s*true/, `${f}: chromium.launch() must pass { headless: true } — found "chromium.launch(${args})"`);
    }
  }
});

test('no source ever launches a headed browser (headless: false)', () => {
  for (const { f, text } of sources) {
    assert.doesNotMatch(text, /headless:\s*false/, `${f} must never set headless: false`);
  }
});

test('persistent headed capability is confined to the opt-in reference browser', () => {
  // Inspect calls, not inventory audit strings or comments that merely mention a launch.
  const parser = new API();
  for (const { f, text } of sources) {
    if (!/chromium\.(launchServer|launchPersistentContext)\(/.test(text)) continue;
    const snapshot = parser.updateSnapshot({ openFiles: [f] });
    try {
      const file = snapshot.getDefaultProjectForFile(f)?.program.getSourceFile(f); assert.ok(file);
      const visit = (node: Node): void => {
        if (isCallExpression(node) && isPropertyAccessExpression(node.expression) && isIdentifier(node.expression.expression)
          && node.expression.expression.text === 'chromium' && ['launchServer', 'launchPersistentContext'].includes(node.expression.name.text)) {
          const mode = node.expression.name.text;
          const options = node.arguments[mode === 'launchPersistentContext' ? 1 : 0];
          assert.ok(options && isObjectLiteralExpression(options), `${f}: explicit launch options required`);
          const headless = options.properties.find(property => isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === 'headless');
          assert.ok(headless && isPropertyAssignment(headless), `${f}: explicit headless option required`);
          if (f === join(root, 'core/ref/browse/browser.ts') && mode === 'launchPersistentContext') {
            assert.match(file.text.slice(headless.pos, headless.end), /headless:\s*!start\.headed/);
          } else assert.equal(headless.initializer.kind, SyntaxKind.TrueKeyword, `${f}: non-browse launches stay headless`);
        }
        node.forEachChild(visit);
      };
      visit(file);
    } finally { snapshot.dispose(); }
  }
});

test('the only browser engine launched is chromium (no firefox/webkit headed surprises)', () => {
  for (const { f, text } of sources) {
    assert.doesNotMatch(text, /\b(?:firefox|webkit)\.launch\(/, `${f} must not launch firefox/webkit`);
  }
});
