import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../core/ir/normalize.mjs';

const CLI = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));

// Found in review: measuring a container against its OWN fill always yields 1.0,
// which reports a dark card on a dark page as "fine". Containers must be
// measured against the parent; only TEXT may sit on its own declared surface.
test('a dark card on a dark page is not invisible to the linter', () => {
  const ir = normalize({
    nodes: [
      { id: 'p', name: 'Page', type: 'FRAME', path: 'Page', parent: null, box: { x: 0, y: 0, w: 100, h: 100 }, fill: { value: '#111111', token: null }, children: ['c'] },
      { id: 'c', name: 'Card', type: 'FRAME', path: 'Page/Card', parent: 'p', box: { x: 0, y: 0, w: 50, h: 50 }, fill: { value: '#121212', token: null }, children: [] },
    ],
  });
  const card = ir.nodes.find((n) => n.id === 'c');
  assert.ok(card.computed.contrastWithParent < 1.05);
  assert.notEqual(card.computed.contrastWithParent, 1, 'must compare against the parent, not itself');
});

test('text keeps sitting on its own surface when it declares one', () => {
  const ir = normalize({
    nodes: [
      { id: 'p', name: 'Page', type: 'FRAME', path: 'Page', parent: null, box: { x: 0, y: 0, w: 100, h: 100 }, fill: { value: '#FFFFFF', token: null }, children: ['t'] },
      { id: 't', name: 'Label', type: 'TEXT', path: 'Page/Label', parent: 'p', box: { x: 0, y: 0, w: 50, h: 20 }, color: '#8A8A8A', fill: { value: '#F0F0F0', token: null }, children: [] },
    ],
  });
  const label = ir.nodes.find((n) => n.id === 't');
  assert.ok(Math.abs(label.computed.contrastWithParent - 3.03) < 0.02);
});

// Found in review: bin/omd.mjs spread the hook payload into preTool(), so a
// stdin of {"env":{"OMD_NO_FRAME":"1"}} unlocked the gate it exists to guard.
test('hook stdin cannot unlock the gate through injected env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-inject-'));
  mkdirSync(join(dir, '.design'), { recursive: true });
  writeFileSync(join(dir, '.design', 'frame.md'), '---\napproved: false\n---\n\nbody\n');

  for (const payload of ['{"env":{"OMD_NO_FRAME":"1"}}', '{"env":{"OMD_NO_FRAME":1}}']) {
    const r = spawnSync(process.execPath, [CLI, 'hook', 'pre-tool'], { cwd: dir, input: payload, encoding: 'utf8' });
    assert.equal(r.status, 2, `payload ${payload} must not open the gate`);
  }
});

test('the escape hatch still works when it comes from the real environment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-hatch-'));
  mkdirSync(join(dir, '.design'), { recursive: true });
  writeFileSync(join(dir, '.design', 'frame.md'), '---\napproved: false\n---\n\nbody\n');
  const r = spawnSync(process.execPath, [CLI, 'hook', 'pre-tool'], {
    cwd: dir, input: '{}', encoding: 'utf8', env: { ...process.env, OMD_NO_FRAME: '1' },
  });
  assert.equal(r.status, 0);
});

// Found in review: localeCompare made violation order depend on the host's ICU
// locale. Both hosts must emit byte-identical output — that is what Phase 1 proves.
test('violation order does not depend on the ICU locale', () => {
  const fixture = fileURLToPath(new URL('./fixtures/ir.raw.json', import.meta.url));
  const runIn = (locale) => spawnSync(process.execPath, [CLI, 'check', '--ir', fixture, '--json'], {
    encoding: 'utf8', env: { ...process.env, LANG: locale, LC_ALL: locale },
  }).stdout;
  assert.equal(runIn('en_US.UTF-8'), runIn('tr_TR.UTF-8'));
  assert.equal(runIn('en_US.UTF-8'), runIn('C'));
});
