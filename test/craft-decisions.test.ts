import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordCraft, readCraft, type CraftCheckpointInput } from '../core/craft/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { browserFixturePng } from './helpers/browser-observation-decision-links.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-craft-decision-')));
  const bytes = browserFixturePng(390, 844);
  writeFileSync(join(root, 'mobile.png'), bytes);
  const input: CraftCheckpointInput = {
    phase: 'semantic', render: 'mobile.png', observed: 'The action ends at y=790 in the 844px viewport.',
    changed: '', decision: 'retain', criterion: 'The primary action fits inside the entry viewport.',
    reason: 'The inspected action is visible with space below it; preserve this layout.',
  };
  return { root, bytes, input, adapter: createTestProjectWriteAdapter(root) };
}

test('an evidenced retain checkpoint records a decision without requiring a source change', () => {
  const { root, bytes, input, adapter } = fixture();
  recordCraft(root, input, adapter);
  const [record] = readCraft(root);
  assert.equal(record?.decision, 'retain');
  assert.equal(record?.changed, '');
  assert.equal(record?.renderSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(record?.criterion, input.criterion);
  assert.ok(!existsSync(join(root, '.omd', 'observation-v2.json')), 'a craft note never issues final evidence');
  const recordedHash = record?.renderSha256;
  writeFileSync(join(root, 'mobile.png'), browserFixturePng(1280, 900));
  assert.equal(readCraft(root)[0]?.renderSha256, recordedHash, 'replacing an image cannot rewrite the recorded evidence identity');
});

test('retain rejects empty rationale, missing evidence, invalid images, and contradictory change claims before writing', () => {
  const { root, input, adapter } = fixture();
  for (const override of [
    { reason: '' }, { criterion: '' }, { observed: '' }, { render: 'missing.png' },
    { decision: 'approve' }, { changed: 'Move the action above the fold.' },
  ]) assert.throws(() => recordCraft(root, { ...input, ...override }, adapter));
  writeFileSync(join(root, 'source.html'), '<main>This is source, not a rendered image.</main>');
  assert.throws(() => recordCraft(root, { ...input, render: 'source.html' }, adapter));
  assert.equal(readCraft(root).length, 0);
});

test('revise still needs an actual change and reframe records the unresolved question without approving it', () => {
  const { root, input, adapter } = fixture();
  assert.throws(() => recordCraft(root, { ...input, decision: 'revise' }, adapter), /--changed/);
  assert.throws(() => recordCraft(root, { ...input, decision: 'revise', changed: 'No change' }, adapter), /--changed/);
  recordCraft(root, { ...input, decision: 'revise', changed: 'Reduce the introduction gap from 48px to 24px.' }, adapter);
  recordCraft(root, { ...input, decision: 'reframe', reason: 'The entry task needs an object selection before this action; return to Framer.' }, adapter);
  assert.deepEqual(readCraft(root).map(item => item.decision), ['revise', 'reframe']);
});

test('historical change-only notes remain readable and cannot impersonate explicit review decisions', () => {
  const { root, input, adapter } = fixture();
  const legacy = { phase: input.phase, render: 'historical.png', observed: 'The primary action was below the fold.', changed: 'Shortened the lead paragraph.' };
  recordCraft(root, legacy, adapter);
  assert.equal(readCraft(root)[0]?.decision, undefined);
  assert.throws(() => recordCraft(root, { ...legacy, criterion: 'Keep the action visible.' }, adapter), /explicit --decision/);
  assert.throws(() => recordCraft(root, { ...legacy, changed: 'No change' }, adapter), /--changed/);
});

test('craft CLI preserves and displays an explicit retain decision', () => {
  const { root, input } = fixture();
  const result = spawnSync(process.execPath, [cli, 'craft', 'checkpoint', 'semantic', '--render', input.render,
    '--observed', input.observed, '--decision', 'retain', '--criterion', input.criterion!, '--reason', input.reason!], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const status = spawnSync(process.execPath, [cli, 'craft', 'status', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout)[0].decision, 'retain');
  assert.match(readFileSync(join(root, '.omd', 'craft.jsonl'), 'utf8'), /renderSha256/);
});
