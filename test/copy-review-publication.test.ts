import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [cli, 'copy', ...args], { cwd, env, encoding: 'utf8' });
const report = (hash: string) => `Mode: copy-editor\nReview time: 2026-09-21T00:00:00Z\nReviewed copy-deck SHA-256: ${hash}\nVerdict: CLEAN\nFindings:\n- The supplied fixture names the action and its boundary.\n`;

test('guarded reviewers obtain exact copy bytes and digest through the public CLI, then stale publication refuses without overwrite', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-copy-input-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
  const deckPath = join(cwd, '.omd/copy-deck.md');
  const published = join(cwd, '.omd/.cache/copy-eye.md');
  const input = join(cwd, '.omd/.cache/review-input.md');
  let previous = '';
  for (const text of ['# Copy\n가나다\n', '# Copy\n가나다', '# Copy\r\n가나다\r\n']) {
    writeFileSync(deckPath, text);
    const snapshotResult = run(cwd, ['review-input', '--json']);
    assert.equal(snapshotResult.status, 0, snapshotResult.stdout + snapshotResult.stderr);
    const snapshot = JSON.parse(snapshotResult.stdout);
    assert.equal(snapshot.schema, 'copy-review-input-v1');
    assert.equal(snapshot.content, text);
    assert.equal(snapshot.byteLength, Buffer.byteLength(text));
    assert.equal(snapshot.sha256, createHash('sha256').update(text).digest('hex'));
    assert.equal(snapshot.path, '.omd/copy-deck.md');
    if (previous) {
      writeFileSync(input, previous);
      assert.equal(run(cwd, ['review-publish', '--input', input, '--json']).status, 1);
      assert.equal(readFileSync(published, 'utf8'), previous);
      assert.equal(run(cwd, ['--review-check', '--json']).status, 1);
    } else assert.equal(existsSync(published), false, 'reading a snapshot never fabricates a review');
    previous = report(snapshot.sha256);
    writeFileSync(input, previous);
    assert.equal(run(cwd, ['review-publish', '--input', input, '--json']).status, 0);
    assert.equal(run(cwd, ['--review-check', '--json']).status, 0);
  }
  writeFileSync(input, report('0'.repeat(64)));
  assert.equal(run(cwd, ['review-publish', '--input', input, '--json']).status, 1);
  assert.equal(readFileSync(published, 'utf8'), previous);
});
