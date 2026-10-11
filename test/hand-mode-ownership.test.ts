import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bindRoleModeInvocation, assertRoleModeOperation } from '../core/runtime/role-mode.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { digest } from '../core/brief/candidate-data.ts';
import { publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { fixture, snapshot, write, routeInput } from './helpers/phase6-process.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { publishTestAdaptiveRoute, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';

function grant(f: Pick<ReturnType<typeof fixture>, 'root' | 'invocation' | 'route'>, role: 'omd-hand' | 'omd-sketch', mode: 'source' | 'observer' | 'visual-study') {
  const payload = { schema: 'role-mode-grant-v1', projectRoot: f.root, role, mode, buildSha256: f.invocation.current.buildSha256,
    briefSha256: f.invocation.current.briefSha256, sourceContractSha256: f.route.sourceContractSha256,
    sourceDirectory: role === 'omd-sketch' ? '.omd/.cache/sketches/A' : null };
  return { ...payload, signature: signNativeObservation(f.root, 'role-mode-grant-v1', digest(payload)) };
}

test('observer cannot mutate production or other owner artifacts; exact native evidence writes remain available', t => {
  const f = fixture(t); write(f.root, 'index.html', 'original source');
  const signed = grant(f, 'omd-hand', 'observer');
  assert.throws(() => bindRoleModeInvocation(f.root, f.invocation, { ...signed, mode: 'source' }));
  const attached = bindRoleModeInvocation(f.root, f.invocation, signed);
  assert.equal(Reflect.set(attached, 'mode', 'source'), false);
  const before = snapshot(f.root);
  for (const path of ['index.html', '.omd/copy-deck.md', '.omd/art-direction.json']) assert.throws(() => f.writer.write(path, 'forged'));
  assert.deepEqual(snapshot(f.root), before);
  f.writer.write('.omd/visual-measurements/native-test.json', 'native publisher bytes');
  assert.ok(existsSync(join(f.root, '.omd/visual-measurements/native-test.json')));
  assert.equal(readFileSync(join(f.root, 'index.html'), 'utf8'), 'original source');
  assert.throws(() => bindRoleModeInvocation(f.root, f.invocation, grant(f, 'omd-hand', 'source')));
  assert.doesNotThrow(() => assertRoleModeOperation(f.invocation, ['measure', '--entry', 'index.html']));
  assert.throws(() => assertRoleModeOperation(f.invocation, ['candidate', 'select']));
});

test('source mode cannot impersonate observer commands, and current Sketch source needs its committed plan', t => {
  const hand = fixture(t); bindRoleModeInvocation(hand.root, hand.invocation, grant(hand, 'omd-hand', 'source'));
  assert.throws(() => assertRoleModeOperation(hand.invocation, ['measure']));
  assert.doesNotThrow(() => assertRoleModeOperation(hand.invocation, ['tokens', 'check']));
  hand.writer.write('index.html', 'source');
  const handBefore = snapshot(hand.root);
  assert.throws(() => hand.writer.write('unrequested.html', 'outside scope'));
  assert.deepEqual(snapshot(hand.root), handBefore);
  const sketch = fixture(t), signed = grant(sketch, 'omd-sketch', 'visual-study');
  // Commit before attaching a source-only Sketch invocation; the aggregate publisher is not Sketch.
  publishCandidatePlan(sketch.root, sketch.plan, sketch.writer, sketch.invocation);
  bindRoleModeInvocation(sketch.root, sketch.invocation, signed);
  const before = snapshot(sketch.root);
  assert.throws(() => sketch.writer.write('.omd/.cache/sketches/B/index.html', 'sibling'));
  assert.deepEqual(snapshot(sketch.root), before);
  sketch.writer.write('.omd/.cache/sketches/A/index.html', 'assigned source');
  assert.ok(existsSync(join(sketch.root, '.omd/.cache/sketches/A/index.html')));
});

test('attached observer publishes a real native measured capture without changing production', async t => {
  const f = measurementFixture('clean'); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const invocation = publishTestAdaptiveRoute(f.root, routeInput());
  const route = readPersistedRoute(f.root, invocation), writer = createTestProjectWriteAdapter(f.root, invocation);
  bindRoleModeInvocation(f.root, invocation, grant({ root: f.root, invocation, route }, 'omd-hand', 'observer'));
  const source = readFileSync(join(f.root, 'dist/index.html'));
  const measured = await measureProject({ root: f.root, invocation, writer, entry: 'dist/index.html' });
  assert.equal(loadMeasurement(f.root, measured.packet).attestation.kind, 'native-observation-v1');
  assert.deepEqual(readFileSync(join(f.root, 'dist/index.html')), source);
});
