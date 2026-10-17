import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { buildNativeFinalManifest, currentNativeFinalObservations } from '../core/runtime/native-final-manifest.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { observationV2Sha256, writeObservationV2 } from '../core/runtime/observation.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { authorizeNativePiPayload, getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { publishModelLedRoute } from './helpers/model-led.ts';

const hash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
function write(root: string, path: string, value: unknown): Buffer {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  writeFileSync(join(root, path), bytes);
  return bytes;
}
function prepared() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-final-manifest-')));
  const route = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  const { invocation, writer } = publishModelLedRoute(root, route, String(route.request));
  mkdirSync(join(root, 'src/copy'), { recursive: true });
  writeFileSync(join(root, 'src/copy/index.html'), '<main>Approved copy</main>');
  writeFileSync(join(root, '.omd/copy-deck.md'), '# Approved copy\n');
  writeSourceSeal(root, invocation);
  write(root, '.omd/activation/native.json', invocation.activation);
  const buildPath = '.omd/builds/current.json';
  const buildBytes = write(root, buildPath, {
    schemaVersion: 'omd-build-identity-v1', packageVersion: '1.0.0',
    buildSha256: invocation.current.buildSha256, sourceSkillSha256: invocation.current.loadedSkillSha256,
  });
  const currentArtifact = { path: buildPath, sha256: hash(buildBytes) };
  const observations = [1, 2].map(index => writeObservationV2(root, {
    currentArtifact, buildSha256: invocation.current.buildSha256,
    observedAt: `2026-09-26T01:0${index}:00.000Z`, evidence: { measured: index },
  }, writer));
  const lane = (name: string, schema: string) => {
    const path = `.omd/final-review/${name}.json`;
    const bytes = write(root, path, { schema });
    authorizeNativePiPayload(invocation, root, 'final-reviewer-lane', bytes);
    return { path, sha256: hash(bytes) };
  };
  const lanes = {
    blindLane: lane('blind', 'adaptive-blind-review-v3'),
    fidelityLane: lane('fidelity', 'adaptive-fidelity-review-v1'),
    protocolLane: lane('protocol', 'adaptive-protocol-review-v1'),
  };
  const attemptValue = { schema: 'native-pi-final-review-attempt-v1', results: [] };
  const attemptSha256 = hash(`${canonicalJson(attemptValue)}\n`);
  const attempt = { path: `.omd/final-review/attempts/sha256-${attemptSha256}.json`, sha256: attemptSha256 };
  write(root, attempt.path, attemptValue);
  const pointer = {
    schema: 'native-pi-final-review-v1', runId: getNativePiRun(invocation, root).runId,
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256, lanes, attempt,
  };
  const pointerBytes = write(root, '.omd/final-review/native-current.json', pointer);
  authorizeNativePiPayload(invocation, root, 'final-reviewer-lane', pointerBytes);
  return { root, invocation, observations, pointer };
}

test('model-led final manifest refuses the retired unmeasured review pointer without writing files', () => {
  const value = prepared();
  try {
    const before = readFileSync(join(value.root, '.omd/source-seal.json'));
    assert.throws(
      () => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'),
      /measured native review/,
    );
    assert.deepEqual(readFileSync(join(value.root, '.omd/source-seal.json')), before);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('reads the complete observation chain in chronological order', () => {
  const value = prepared();
  try {
    const result = currentNativeFinalObservations(value.root);
    assert.deepEqual(result.map(item => item.value), value.observations);
    assert.deepEqual(result.map(item => item.receipt.sha256), value.observations.map(observationV2Sha256));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses a stale predecessor rather than dropping earlier observations', () => {
  const value = prepared();
  try {
    const first = value.observations[0];
    assert.ok(first);
    writeFileSync(join(value.root, `.omd/observation-v2/sha256-${observationV2Sha256(first)}.json`), '{}');
    assert.throws(() => currentNativeFinalObservations(value.root), /observation/i);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses a symlinked observation record', () => {
  const value = prepared();
  try {
    const first = value.observations[0];
    assert.ok(first);
    const path = `.omd/observation-v2/sha256-${observationV2Sha256(first)}.json`;
    writeFileSync(join(value.root, '.omd/saved.json'), readFileSync(join(value.root, path)));
    rmSync(join(value.root, path));
    symlinkSync('../saved.json', join(value.root, path));
    assert.throws(() => currentNativeFinalObservations(value.root), /symlink|observation/i);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses altered lane selection without changing source evidence', () => {
  const value = prepared();
  try {
    const before = readFileSync(join(value.root, '.omd/source-seal.json'));
    write(value.root, '.omd/final-review/native-current.json', { ...value.pointer, briefSha256: hash('different request') });
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'), /authoriz|binding|current/i);
    assert.deepEqual(readFileSync(join(value.root, '.omd/source-seal.json')), before);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('retired lane records cannot restore the unmeasured review path', () => {
  const value = prepared();
  try {
    write(value.root, value.pointer.lanes.blindLane.path, { schema: 'adaptive-blind-review-v3', verdicts: { blindVisual: 'GREEN' } });
    assert.throws(
      () => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'),
      /measured native review/,
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses an authorized pointer for a different brief', () => {
  const value = prepared();
  try {
    const bytes = write(value.root, '.omd/final-review/native-current.json', { ...value.pointer, briefSha256: hash('other brief') });
    authorizeNativePiPayload(value.invocation, value.root, 'final-reviewer-lane', bytes);
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'), /pointer is not current/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses stale activation bytes rather than binding a different host run', () => {
  const value = prepared();
  try {
    write(value.root, '.omd/activation/native.json', { ...value.invocation.activation, briefSha256: hash('other run') });
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'), /activation receipt is not current/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses observation chains whose build identity file changed', () => {
  const value = prepared();
  try {
    write(value.root, '.omd/builds/current.json', { schemaVersion: 'omd-build-identity-v1', buildSha256: hash('other build') });
    assert.throws(() => currentNativeFinalObservations(value.root), /build identity is stale/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('rejects an escaping activation path before reading external evidence', () => {
  const value = prepared();
  try {
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '../activation.json'), /project-relative/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses changed review attempt bytes despite an authorized pointer', () => {
  const value = prepared();
  try {
    write(value.root, value.pointer.attempt.path, { schema: 'native-pi-final-review-attempt-v1', results: ['changed'] });
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'), /attempt digest changed/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses review attempts outside the content-addressed attempt directory', () => {
  const value = prepared();
  try {
    const bytes = write(value.root, '.omd/final-review/native-current.json', {
      ...value.pointer, attempt: { ...value.pointer.attempt, path: '.omd/other.json' },
    });
    authorizeNativePiPayload(value.invocation, value.root, 'final-reviewer-lane', bytes);
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'), /attempt descriptor is invalid/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

for (const foreignRun of [false, true]) test(`native Pi ${foreignRun ? 'refuses another' : 'accepts its own'} authorized review run`, () => {
  const value = prepared();
  try {
    const invocation = value.invocation;
    const pointerBytes = write(value.root, '.omd/final-review/native-current.json', {
      ...value.pointer, runId: foreignRun ? hash('other run') : getNativePiRun(invocation, value.root).runId,
    });
    for (const lane of Object.values(value.pointer.lanes)) authorizeNativePiPayload(invocation, value.root, 'final-reviewer-lane', readFileSync(join(value.root, lane.path)));
    authorizeNativePiPayload(invocation, value.root, 'final-reviewer-lane', pointerBytes);
    if (foreignRun) assert.throws(() => buildNativeFinalManifest(value.root, invocation, '.omd/activation/native.json'), /pointer run is not current/);
    else assert.throws(() => buildNativeFinalManifest(value.root, invocation, '.omd/activation/native.json'), /measured native review/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
