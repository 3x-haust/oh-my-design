import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { observedProcessExecutableSha256 } from '../core/runtime/process-executable.ts';

test('physical executable authentication survives a Node child renamed to pi', async t => {
  const child = spawn(process.execPath, ['-e', "process.title='pi';process.stdout.write('ready');process.stdin.resume();"], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', () => resolve());
  });
  assert.ok(child.pid);
  assert.equal(observedProcessExecutableSha256(child.pid), createHash('sha256').update(readFileSync(process.execPath)).digest('hex'));
});

test('invalid process identifiers never produce executable authority', () => {
  for (const pid of [-1, 0, Number.NaN, 1.5]) assert.equal(observedProcessExecutableSha256(pid), undefined);
});
