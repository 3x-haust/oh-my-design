import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyStack } from '../core/stack/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

function withDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'omd-stack-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('verifyStack passes when a package.json materialised (React scaffold or existing project)', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18', vite: '^5' } }));
    writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
    const c = verifyStack(dir);
    assert.equal(c.ok, true);
    assert.equal(c.actual, 'react-or-existing');
  });
});

test('verifyStack fails a greenfield that shipped plain HTML with no manifest and no HTML decision', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>');
    writeFileSync(join(dir, 'style.css'), 'body{}');
    mkdirSync(join(dir, '.omd'), { recursive: true });
    // A decisions log that never records a verbatim HTML request.
    writeFileSync(join(dir, '.omd', 'decisions.md'), '# Decisions\n- chose a teal accent palette');
    const c = verifyStack(dir);
    assert.equal(c.ok, false);
    assert.equal(c.actual, 'plain-html');
    assert.match(c.reason, /stack-routing defect/i);
  });
});

test('verifyStack allows plain HTML when a verbatim user request for HTML is recorded', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>');
    mkdirSync(join(dir, '.omd'), { recursive: true });
    writeFileSync(
      join(dir, '.omd', 'decisions.md'),
      '# Decisions\n- Plain HTML/CSS/JS. Why: user asked verbatim — "그냥 html css js로 만들어줘"',
    );
    const c = verifyStack(dir);
    assert.equal(c.ok, true);
    assert.equal(c.actual, 'plain-html');
  });
});

test('verifyStack is silent on an empty directory with nothing shipped', () => {
  withDir((dir) => {
    const c = verifyStack(dir);
    assert.equal(c.ok, true);
    assert.equal(c.actual, 'none');
  });
});

test('the loop and the hand gate stack conformance early with omd stack --check', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  assert.match(loop, /Stack conformance is an early gate and a ship gate: run `omd stack --check`/i);
  assert.match(loop, /right after the greenfield scaffold \(before authoring any surface\)/i);
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  assert.match(hand, /your FIRST production write is the computed stack's scaffold/i);
  assert.match(hand, /A DEFECT there means your first write was plain HTML instead of the scaffold/i);
});
