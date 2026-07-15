import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// OMD never opens a visible browser window in any situation: every Playwright launch is headless.
// This is a source guard so a future edit cannot introduce a headed (headless:false) or a bare
// chromium.launch() that inherits a non-headless default.

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

test('the only browser engine launched is chromium (no firefox/webkit headed surprises)', () => {
  for (const { f, text } of sources) {
    assert.doesNotMatch(text, /\b(?:firefox|webkit)\.launch\(/, `${f} must not launch firefox/webkit`);
  }
});
