import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectedTerminalFixture } from './helpers/selected-terminal.ts';
import { loadTerminalProcess } from '../core/evidence/final-v2-process.ts';
import { publishSurfaceCaptureInventory } from '../core/evidence/surface-capture-inventory.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';

test('surface capture schema names the guarded Hand publication path', () => {
  const starter = inputSkeleton('surface-captures');
  assert.equal(starter.path, '.omd/.cache/surface-captures-input.json');
  assert.equal(
    starter.command,
    'omd lifecycle surface-captures --input .omd/.cache/surface-captures-input.json --json',
  );
  assert.deepEqual(starter.keys, ['schema', 'captures', 'contentProofs']);
});

test('surface capture owner publishes exact current coverage consumed by terminal review', { timeout: 600_000 }, async t => {
  const f = await selectedTerminalFixture(t);
  const path = join(f.root, '.omd/surface-captures.json');
  const input = JSON.parse(readFileSync(path, 'utf8'));
  rmSync(path);

  const receipt = publishSurfaceCaptureInventory(f.root, input, f.writer, f.invocation);

  assert.equal(receipt.path, '.omd/surface-captures.json');
  assert.equal(existsSync(path), true);
  const process = loadTerminalProcess(f.root, f.invocation, f.observationSha256s)!;
  assert.equal(process.binding.surface!.input.sha256, receipt.sha256);
  assert.equal(process.surfaceRows.length, 2);
});

test('surface capture publication refuses incomplete, forged, and ownerless coverage without mutation', { timeout: 600_000 }, async t => {
  const f = await selectedTerminalFixture(t);
  const path = join(f.root, '.omd/surface-captures.json');
  const original = JSON.parse(readFileSync(path, 'utf8'));
  const compositionPath = join(f.root, '.omd/composition.md');
  const composition = readFileSync(compositionPath);
  rmSync(path);

  const incomplete = structuredClone(original);
  incomplete.captures.pop();
  assert.throws(
    () => publishSurfaceCaptureInventory(f.root, incomplete, f.writer, f.invocation),
    /every required Frame cell|exactly/,
  );
  assert.equal(existsSync(path), false);

  const forged = structuredClone(original);
  forged.captures[0].capture.sha256 = '0'.repeat(64);
  assert.throws(
    () => publishSurfaceCaptureInventory(f.root, forged, f.writer, f.invocation),
    /stale receipt|actual current native mapped view\/state/,
  );
  assert.equal(existsSync(path), false);

  rmSync(compositionPath);
  assert.throws(
    () => publishSurfaceCaptureInventory(f.root, original, f.writer, f.invocation),
    /no composition owner or authorized applicability skip/,
  );
  assert.equal(existsSync(path), false);
  writeFileSync(compositionPath, composition);
});
