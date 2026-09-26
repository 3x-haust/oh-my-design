import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildNativeFinalManifest, currentNativeFinalObservations } from '../core/runtime/native-final-manifest.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { observationV2Sha256, writeObservationV2 } from '../core/runtime/observation.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { publishAdaptiveWorkflowPlan } from '../core/design-development/workflow-persistence.ts';
import { authorizeNativePiPayload, createTestNativePiInvocation, getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { authorizeTestProjectRunPayloads, createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';

const hash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
function write(root: string, path: string, value: unknown): Buffer {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  writeFileSync(join(root, path), bytes);
  return bytes;
}
function prepared(workflow = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-final-manifest-')));
  const route: unknown = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, route, 'native manifest fixture');
  const writer = createTestProjectWriteAdapter(root, invocation);
  mkdirSync(join(root, 'src/copy'), { recursive: true });
  writeFileSync(join(root, 'src/copy/index.html'), '<main>Approved copy</main>');
  writeFileSync(join(root, '.omd/copy-deck.md'), '# Approved copy\n');
  if (workflow) publishAdaptiveWorkflowPlan(root, {
    development: { schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'direct', risks: [], investigations: [], referencePrinciples: [], rationale: 'Approved copy repair leaves no design uncertainty.' },
    evidence: [], investigations: [], rationale: 'Use the existing confirmed copy and direct verification.',
  }, writer, invocation);
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
    authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'final-reviewer-lane', payload: bytes }]);
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
    schema: 'native-pi-final-review-v1', runId: 'fixture-run',
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256, lanes, attempt,
  };
  const pointerBytes = write(root, '.omd/final-review/native-current.json', pointer);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'final-reviewer-lane', payload: pointerBytes }]);
  return { root, invocation, observations, pointer };
}

test('assembles current adaptive evidence without authoring verdicts or writing files', () => {
  const value = prepared();
  try {
    const before = readFileSync(join(value.root, '.omd/source-seal.json'));
    const result = buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json');
    assert.equal(result.graph.schema, 'final-evidence-v2-adaptive-omission-graph');
    assert.equal(result.graph.buildIdentity.path, '.omd/builds/current.json');
    assert.deepEqual(result.graph.observations.map(item => item.sha256), value.observations.map(observationV2Sha256));
    assert.equal(result.graph.blindLane.schema, 'adaptive-blind-review-v3');
    assert.deepEqual(readFileSync(join(value.root, '.omd/source-seal.json')), before);
    assert.equal(result.motionDecision, 'none');
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

test('retains the current workflow binding when the source seal selects it', () => {
  const value = prepared(true);
  try {
    const result = buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json');
    assert.equal(result.graph.schema, 'final-evidence-v2-workflow-graph-v1');
    assert.equal(result.graph.sourceSeal.schema, 'source-seal-v2');
    assert.ok('workflow' in result.graph);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses a changed lane record even when the selection pointer is authorized', () => {
  const value = prepared();
  try {
    write(value.root, value.pointer.lanes.blindLane.path, { schema: 'adaptive-blind-review-v3', verdicts: { blindVisual: 'GREEN' } });
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'), /blindLane digest changed/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refuses an authorized pointer for a different brief', () => {
  const value = prepared();
  try {
    const bytes = write(value.root, '.omd/final-review/native-current.json', { ...value.pointer, briefSha256: hash('other brief') });
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{ purpose: 'final-reviewer-lane', payload: bytes }]);
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
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{ purpose: 'final-reviewer-lane', payload: bytes }]);
    assert.throws(() => buildNativeFinalManifest(value.root, value.invocation, '.omd/activation/native.json'), /attempt descriptor is invalid/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

for (const foreignRun of [false, true]) test(`native Pi ${foreignRun ? 'refuses another' : 'accepts its own'} authorized review run`, () => {
  const value = prepared();
  try {
    const cliPath = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
    const invocation = createTestNativePiInvocation({ root: value.root, current: value.invocation.current,
      host: { nodePath: process.execPath, nodeSha256: hash(readFileSync(process.execPath)), cliPath,
        cliSha256: hash(readFileSync(cliPath)), provider: 'openai-codex', model: 'gpt-6-luna',
        thinkingLevel: 'medium', parentSessionId: 'manifest-fixture' } });
    const input: unknown = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
    publishAdaptiveRoute(value.root, input, createTestProjectWriteAdapter(value.root, invocation), invocation);
    writeSourceSeal(value.root, invocation);
    write(value.root, '.omd/activation/native.json', invocation.activation);
    const pointerBytes = write(value.root, '.omd/final-review/native-current.json', {
      ...value.pointer, runId: foreignRun ? hash('other run') : getNativePiRun(invocation, value.root).runId,
    });
    for (const lane of Object.values(value.pointer.lanes)) authorizeNativePiPayload(invocation, value.root, 'final-reviewer-lane', readFileSync(join(value.root, lane.path)));
    authorizeNativePiPayload(invocation, value.root, 'final-reviewer-lane', pointerBytes);
    if (foreignRun) assert.throws(() => buildNativeFinalManifest(value.root, invocation, '.omd/activation/native.json'), /pointer run is not current/);
    else assert.equal(buildNativeFinalManifest(value.root, invocation, '.omd/activation/native.json').schema, 'final-evidence-v2');
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
