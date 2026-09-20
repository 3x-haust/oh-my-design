import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
test('public evidence hashing supplies exact local fingerprints without shell access or private authority reads', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-hash-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd/refs/design'), { recursive: true });
  const content = Buffer.from('카피\r\n');
  writeFileSync(join(cwd, '.omd/refs/design/capture.json'), content);
  symlinkSync(join(cwd, '.omd/refs/design/capture.json'), join(cwd, '.omd/link'));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, 'hash', ...args, '--json'], { cwd, encoding: 'utf8' });
  const valid = run('.omd/refs/design/capture.json');
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { path: '.omd/refs/design/capture.json', byteLength: content.length, sha256: createHash('sha256').update(content).digest('hex') });
  for (const path of ['../escape', '.omd/../escape', '.omd/activation/project.key', '.omd/.project-mutation.lock', '.omd/link', '/etc/hosts']) {
    assert.equal(run(path).status, 1, path);
  }
  assert.equal(run().status, 1);
  assert.equal(run('.omd/refs/design/capture.json', '.omd/other').status, 1);
});
