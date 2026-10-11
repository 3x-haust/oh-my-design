import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

test('source study authoring input is discoverable without creating project records', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-study-schema-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [cli, 'schema', 'source-study', '--json'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const entry = JSON.parse(result.stdout);
  assert.equal(entry.name, 'source-study');
  assert.equal(entry.skeleton.schema, 'source-study-input-v1');
  assert.ok(Array.isArray(entry.skeleton.variants));
  assert.ok(Array.isArray(entry.skeleton.destinationContent));
  assert.deepEqual(readdirSync(root), []);
});

test('study creation outside an authenticated Pi run refuses before project mutation', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-study-cli-refusal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [cli, 'study', 'create', '--input', '-', '--json'], {
    cwd: root, encoding: 'utf8', input: JSON.stringify({
      schema: 'source-study-input-v1', reason: 'One current hypothesis.', primaryAction: 'Write a note.',
      destinationContent: [{ path: 'content.txt', content: 'Book and note' }],
      variants: [{ id: 'alpha', relationship: 'Keep the note with the book.', observableConsequence: 'Context stays visible.' }],
    }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NATIVE_PI/);
  assert.deepEqual(readdirSync(root), []);
});

test('provisional study selection has its own discoverable input', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-study-selection-schema-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [cli, 'schema', 'source-study-selection', '--json'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).skeleton.schema, 'source-study-selection-input-v1');
  assert.deepEqual(readdirSync(root), []);
});
