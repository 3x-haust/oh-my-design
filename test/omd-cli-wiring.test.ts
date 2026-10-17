import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { INPUT_SKELETONS } from '../core/schema/inputs.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd === undefined ? {} : { cwd }) });

test('schema list exposes only retained model-led authoring inputs', () => {
  const result = run(['schema', 'list', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const listed = JSON.parse(result.stdout) as Array<{ name: string }>;
  assert.deepEqual(
    listed.map(entry => entry.name).sort(),
    INPUT_SKELETONS.map(entry => entry.name).sort(),
  );
  for (const removed of ['native-maker', 'candidate-selection', 'frame', 'composition', 'design-handoff']) {
    assert.equal(listed.some(entry => entry.name === removed), false);
  }
});

test('retained schema output is stable in text and json modes', () => {
  const json = run(['schema', 'trusted-lifecycle-manifest', '--json']);
  const text = run(['schema', 'trusted-lifecycle-manifest']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(text.status, 0, text.stderr);
  const entry = JSON.parse(json.stdout) as { skeleton: unknown };
  assert.deepEqual(JSON.parse(text.stdout.slice(text.stdout.lastIndexOf('\n{') + 1)), entry.skeleton);
});

test('help lists the bounded CLI and omits structured publishers', () => {
  const result = run(['help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lifecycle help\|verify\|finish/);
  assert.match(result.stdout, /first-render check/);
  assert.match(result.stdout, /ref discover-plan\|discover-batch/);
  for (const removed of ['maker run', 'study create', 'candidate select', 'workflow plan', 'lifecycle evaluate', 'composition --check']) {
    assert.doesNotMatch(result.stdout, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('lifecycle help advertises only retained lifecycle commands', () => {
  const result = run(['lifecycle', 'help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lifecycle verify/);
  assert.match(result.stdout, /lifecycle finish/);
  assert.doesNotMatch(result.stdout, /evaluate|repair|refine|finalize|surface-captures/);
});

test('ref direction-review reaches the retained admission command', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-direction-review-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = run(['ref', 'direction-review', '--json'], root);
  assert.equal(result.status, 1);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /unknown command/i);
  assert.match(`${result.stdout}\n${result.stderr}`, /route|authority|REFERENCE_DIRECTION/i);
});

test('spawned lifecycle finish reaches the retained model-led command', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-lifecycle-finish-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = run(['lifecycle', 'finish', '--root', root, '--json']);
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout) as {
    schema: string;
    ok: boolean;
    diagnostic: { code: string };
  };
  assert.equal(output.schema, 'model-led-completion-result-v1');
  assert.equal(output.ok, false);
  assert.equal(output.diagnostic.code, 'NATIVE_PI_AUTHORITY');
  assert.doesNotMatch(result.stderr, /unknown command/i);
});
