import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { measureProject } from '../core/measure/index.ts';
import * as measured from '../core/slop/measured-review.ts';
import { isMutatingOmdCommand } from '../extensions/omd-guard.ts';

test('measured review input pages retain every signed finding without publishing judgments', async t => {
  const f = measurementFixture('test-016');
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const result = await measureProject({ ...f, entry: 'dist/index.html' });
  const clone = globalThis.structuredClone;
  let ruleGraphClones = 0;
  let measurementGraphClones = 0;
  const cloneSpy = t.mock.method(globalThis, 'structuredClone',
    <T>(value: T, options?: Parameters<typeof structuredClone>[1]): T => {
      if (typeof value === 'object' && value !== null && 'nodes' in value && 'stats' in value) {
        ruleGraphClones += 1;
        if ('measurement' in value) measurementGraphClones += 1;
      }
      return clone(value, options);
    });
  const checkpoint = measured.captureMeasuredSlopCheckpoint(f.root,
    { schema: 'slop-measured-scope-v2', measurements: [result.packet] }, f.writer, f.invocation);
  cloneSpy.mock.restore();
  assert.ok(ruleGraphClones > 0);
  assert.equal(measurementGraphClones, 0, 'builtin rule snapshots exclude authenticated measurement payloads');
  assert.ok(checkpoint.findings.length > 1);
  const pointer = readFileSync(join(f.root, '.omd/slop/latest.json'));
  const retained = [];
  for (let offset = 0; offset < checkpoint.findings.length; offset++) {
    const page = measured.measuredSlopReviewInput(f.root, checkpoint.checkpoint.sha256, offset, 1);
    assert.deepEqual(page.checkpoint, checkpoint.checkpoint);
    assert.equal(page.total, checkpoint.findings.length);
    assert.equal(page.offset, offset);
    assert.equal(page.nextOffset, offset + 1 < checkpoint.findings.length ? offset + 1 : null);
    assert.deepEqual(page.findings, checkpoint.findings.slice(offset, offset + 1));
    assert.deepEqual(page.reviewInput.decisions, checkpoint.reviewInput.decisions.slice(offset, offset + 1));
    retained.push(...page.findings);
  }
  assert.deepEqual(retained, checkpoint.findings);
  assert.throws(() => measured.measuredSlopReviewInput(f.root, '0'.repeat(64), 0, 1), /checkpoint.*changed/);
  for (const [offset, limit] of [[-1, 1], [0, 0], [0, 9], [0.5, 1]]) {
    assert.throws(() => measured.measuredSlopReviewInput(f.root, checkpoint.checkpoint.sha256, offset, limit), /page/);
  }
  const args = ['slop', 'review-input', '--checkpoint', checkpoint.checkpoint.sha256,
    '--offset', '0', '--limit', '1', '--json'];
  assert.equal(isMutatingOmdCommand(args), false);
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const command = spawnSync(process.execPath, [cli, ...args], { cwd: f.root, encoding: 'utf8' });
  assert.equal(command.status, 0, command.stderr);
  assert.deepEqual(JSON.parse(command.stdout).findings, checkpoint.findings.slice(0, 1));
  assert.deepEqual(readFileSync(join(f.root, '.omd/slop/latest.json')), pointer);
  assert.throws(() => measured.checkMeasuredSlopReview(f.root), /has no review/);
  const checkpointPath = join(f.root, checkpoint.checkpoint.path);
  writeFileSync(checkpointPath, `${readFileSync(checkpointPath, 'utf8')} `);
  assert.throws(() => measured.measuredSlopReviewInput(f.root, checkpoint.checkpoint.sha256, 0, 1), /bytes changed/);
  assert.deepEqual(readFileSync(join(f.root, '.omd/slop/latest.json')), pointer);
});
