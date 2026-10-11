import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classifyPiWrite, isMutatingOmdCommand } from '../extensions/omd-guard.ts';

test('study publishers are mutations while inspection commands remain read-only', () => {
  assert.equal(isMutatingOmdCommand(['study', 'create', '--input', 'input.json']), true);
  assert.equal(isMutatingOmdCommand(['study', 'select', '--input', 'selection.json']), true);
  assert.equal(isMutatingOmdCommand(['study', 'show', '--json']), false);
  assert.equal(isMutatingOmdCommand(['study', 'latest', '--json']), false);
});

test('native tools cannot hand-write managed study records or captured outputs', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-study-write-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['current.json', 'latest.json', 'sets/a.json', 'selections/a.json', 'html/a.html', 'renders/a.png']) {
    assert.equal(classifyPiWrite(root, `.omd/.cache/studies/${path}`).kind, 'blocked');
  }
  assert.equal(classifyPiWrite(root, '.omd/.cache/source-study-input.json').kind, 'authoring');
  assert.equal(classifyPiWrite(root, '.omd/.cache/source-study-selection.json').kind, 'authoring');
  assert.equal(classifyPiWrite(root, '.omd/.cache/studies/study-abcdef/index.html').kind, 'authoring');
});
