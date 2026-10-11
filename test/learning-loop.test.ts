import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';
import type { DesignDecision } from '../core/deliberation/contracts.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import {
  BROWSER_OBSERVATION_SCHEMA, BROWSER_OBSERVATION_SET_SCHEMA, browserObservationSha256,
  designDecisionSha256, type BrowserObservationCore,
} from '../core/runtime/browser-observation.ts';
import {
  applicableLearnedRules, promoteLearnings, recordLearningAuthorityJudgment, recordLearningObservation, recordLearningPrediction,
  type LearningObservationInput, type LearningRuleIndex,
} from '../core/learning/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const cli = join(import.meta.dirname, '..', 'bin', 'omd.ts');
const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const crc32 = (bytes: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
};
function png(fill: number): Buffer {
  const width = 390; const height = 844;
  const chunk = (type: string, value: Buffer): Buffer => {
    const bytes = Buffer.alloc(value.length + 12); bytes.writeUInt32BE(value.length, 0); bytes.write(type, 4); value.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, value.length + 8)), value.length + 8); return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.alloc(width * 3 + 1, fill); row[0] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
function fixture(): { root: string; state: string; decisionGraphPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-learning-loop-'));
  const state = mkdtempSync(join(tmpdir(), 'omd-learning-state-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const decision: DesignDecision = {
    id: 'first-viewport-work', stage: 'composition', risk: 'medium', owner: 'omd-composer',
    question: 'Should the work object appear in the first viewport?',
    alternatives: [{ id: 'object-first', label: 'Object first' }, { id: 'intro-first', label: 'Intro first' }],
    selected: 'object-first', evidence: ['capture:dashboard'], constraints: ['Keep the primary task visible'],
    rejected: [{ id: 'intro-first', reason: 'It delays the primary task.' }],
    affects: ['surface:product-dashboard', 'learning:first-viewport-work'], dependsOn: [], reversible: true, tradeoffs: [],
  };
  const decisionGraphPath = '.omd/decision-graph.json';
  writeFileSync(join(root, decisionGraphPath), `${canonicalJson({ schema: 'decision-graph-v1', decisions: [decision] })}\n`);
  return { root, state, decisionGraphPath };
}
function observation(root: string, decisionGraphPath: string, runId: string, contextId: string, day: number, outcome: 'validated' | 'contradicted' = 'validated'): LearningObservationInput {
  const capturePath = `.omd/captures/${runId}.png`; const evidencePath = `.omd/evidence/${runId}.json`;
  mkdirSync(dirname(join(root, capturePath)), { recursive: true }); mkdirSync(dirname(join(root, evidencePath)), { recursive: true });
  const capture = png(day); writeFileSync(join(root, capturePath), capture);
  const graph = JSON.parse(readFileSync(join(root, decisionGraphPath), 'utf8')) as { decisions: DesignDecision[] };
  const selected = graph.decisions[0]!;
  const core: BrowserObservationCore = {
    schema: BROWSER_OBSERVATION_SCHEMA, testedUrl: 'http://localhost/dashboard', testedState: 'ready', viewport: { width: 390, height: 844 },
    observableResult: { kind: 'screenshot', capture: { path: capturePath, sha256: sha(capture) }, result: { measurement: 'viewport-pixels', width: 390, height: 844 } },
    decisionRefs: [{ decisionId: selected.id, decisionSha256: designDecisionSha256(selected) }],
  };
  const evidence = { browserObservations: { schema: BROWSER_OBSERVATION_SET_SCHEMA, decisionGraphSha256: sha(readFileSync(join(root, decisionGraphPath))), observations: [{ ...core, observationSha256: browserObservationSha256(core) }] } };
  const bytes = `${canonicalJson(evidence)}\n`; writeFileSync(join(root, evidencePath), bytes);
  return { predictionId: 'first-viewport-work', runId, contextId, outcome, observedAt: new Date(Date.now() - (27 - day) * 24 * 60 * 60 * 1000).toISOString(), decisionGraphPath, evidence: { path: evidencePath, sha256: sha(bytes) } };
}
const prediction = {
  decisionId: 'first-viewport-work', surface: 'product-dashboard', route: '/dashboard', testedState: 'ready',
  viewport: { width: 390, height: 844 }, predictedSignal: 'First viewport shows the work object.',
} as const;
function publishAuthority(root: string) {
  return recordLearningAuthorityJudgment(root, {
    predictionId: prediction.decisionId,
    decision: 'scoped-observation',
    reason: 'The statement is limited to the observed dashboard scope and does not claim user or system authority.',
    quote: prediction.predictedSignal,
  }, createTestProjectWriteAdapter(root));
}

function run(root: string, state: string, args: readonly string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, XDG_STATE_HOME: state }, encoding: 'utf8' });
}

test('learn CLI predicts, observes two authenticated runs, promotes, and filters advisory rules by surface', () => {
  const value = fixture();
  try {
    writeFileSync(join(value.root, 'prediction.json'), JSON.stringify(prediction));
    const predicted = run(value.root, value.state, ['learn', 'predict', '--input', 'prediction.json', '--json']);
    assert.equal(predicted.status, 0, predicted.stderr);
    const authorityInput = { predictionId: prediction.decisionId, decision: 'scoped-observation',
      reason: 'A scoped observation for this dashboard, not user permission or a system rule.',
      quote: prediction.predictedSignal };
    writeFileSync(join(value.root, 'authority.json'), JSON.stringify(authorityInput));
    const judged = run(value.root, value.state, ['learn', 'judge', '--input', 'authority.json', '--json']);
    assert.equal(judged.status, 0, judged.stderr);
    const authorityPath = join(value.root, '.omd/learning/authority', `${prediction.decisionId}.json`);
    const authorityBefore = readFileSync(authorityPath);
    writeFileSync(join(value.root, 'authority.json'), JSON.stringify({ ...authorityInput, quote: 'A different proposition.' }));
    const forged = run(value.root, value.state, ['learn', 'judge', '--input', 'authority.json', '--json']);
    assert.notEqual(forged.status, 0);
    assert.deepEqual(readFileSync(authorityPath), authorityBefore);
    for (const [index, item] of [observation(value.root, value.decisionGraphPath, 'run-one', 'context-one', 25), observation(value.root, value.decisionGraphPath, 'run-two', 'context-two', 26)].entries()) {
      writeFileSync(join(value.root, `observation-${index}.json`), JSON.stringify(item));
      const observed = run(value.root, value.state, ['learn', 'observe', '--input', `observation-${index}.json`, '--json']);
      assert.equal(observed.status, 0, observed.stderr);
    }
    const promoted = run(value.root, value.state, ['learn', 'promote', '--json']);
    assert.equal(promoted.status, 0, promoted.stderr);
    const summary = JSON.parse(promoted.stdout) as { results: { status: string }[]; calibration: { hitRate: number }; index: { location: string } };
    assert.deepEqual(summary.results.map((entry) => entry.status), ['promoted']);
    assert.equal(summary.calibration.hitRate, 1); assert.equal(summary.index.location, 'user');
    const applicable = run(value.root, value.state, ['learn', 'rules', '--surface', 'product-dashboard', '--json']);
    assert.equal(applicable.status, 0, applicable.stderr); assert.equal((JSON.parse(applicable.stdout) as unknown[]).length, 1);
    const otherProject = mkdtempSync(join(tmpdir(), 'omd-learning-other-project-'));
    try {
      const crossProject = run(otherProject, value.state, ['learn', 'rules', '--surface', 'product-dashboard', '--json']);
      assert.equal(crossProject.status, 0, crossProject.stderr); assert.equal((JSON.parse(crossProject.stdout) as unknown[]).length, 1);
    } finally { rmSync(otherProject, { recursive: true, force: true }); }
    const unrelated = run(value.root, value.state, ['learn', 'rules', '--surface', 'marketing', '--json']);
    assert.equal(unrelated.status, 0, unrelated.stderr); assert.deepEqual(JSON.parse(unrelated.stdout), []);
  } finally { rmSync(value.root, { recursive: true, force: true }); rmSync(value.state, { recursive: true, force: true }); }
});

test('an unavailable user state store falls back to the guarded project index', () => {
  const value = fixture();
  try {
    const writer = createTestProjectWriteAdapter(value.root);
    const environment = { ...process.env, XDG_STATE_HOME: 'relative-state-is-invalid' };
    recordLearningPrediction(value.root, prediction, writer, '2026-09-24T00:00:00.000Z');
    publishAuthority(value.root);
    recordLearningObservation(value.root, observation(value.root, value.decisionGraphPath, 'run-one', 'context-one', 25), writer);
    recordLearningObservation(value.root, observation(value.root, value.decisionGraphPath, 'run-two', 'context-two', 26), writer);
    const promoted = promoteLearnings(value.root, writer, { now: new Date().toISOString(), environment });
    assert.deepEqual(promoted.index, { location: 'project', path: '.omd/learning/rules-index.json' });
    assert.equal(applicableLearnedRules({ surface: 'product-dashboard' }, { projectRoot: value.root, environment }).length, 1);
    const indexPath = join(value.root, '.omd/learning/rules-index.json');
    const original = readFileSync(indexPath, 'utf8');
    for (const violation of ['extra-field', 'authority', 'override', 'calibration', 'scope', 'provenance'] as const) {
      const index = JSON.parse(original) as LearningRuleIndex;
      const entry = index.entries[0];
      assert.ok(entry?.rule);
      const rule = entry.rule;
      switch (violation) {
        case 'extra-field': Reflect.set(index, 'unexpected', true); break;
        case 'authority': Reflect.set(rule, 'authority', 'system'); break;
        case 'override': Reflect.set(rule, 'cannotOverride', []); break;
        case 'calibration': Reflect.set(entry.calibration, 'hits', -1); break;
        case 'scope': Reflect.set(rule, 'scope', { ...rule.scope, route: '/unobserved' }); break;
        case 'provenance': Reflect.set(rule, 'provenance', []); break;
        default: { const unreachable: never = violation; throw new Error(unreachable); }
      }
      const changed = JSON.stringify(index);
      writeFileSync(indexPath, changed);
      assert.throws(() => applicableLearnedRules({ surface: 'product-dashboard' }, { projectRoot: value.root, environment }),
        error => error instanceof Error && !(error instanceof TypeError), violation);
      assert.equal(readFileSync(indexPath, 'utf8'), changed);
    }
    writeFileSync(indexPath, original);
    assert.equal(applicableLearnedRules({ surface: 'product-dashboard' }, { projectRoot: value.root, environment }).length, 1);
  } finally { rmSync(value.root, { recursive: true, force: true }); rmSync(value.state, { recursive: true, force: true }); }
});

test('a later authenticated contradiction publishes a contradicted index entry and removes the advisory rule', () => {
  const value = fixture();
  try {
    const writer = createTestProjectWriteAdapter(value.root);
    recordLearningPrediction(value.root, prediction, writer, '2026-09-24T00:00:00.000Z');
    recordLearningObservation(value.root, observation(value.root, value.decisionGraphPath, 'run-one', 'context-one', 25), writer);
    recordLearningObservation(value.root, observation(value.root, value.decisionGraphPath, 'run-two', 'context-two', 26, 'contradicted'), writer);
    const promoted = promoteLearnings(value.root, writer, { now: new Date().toISOString(), environment: { ...process.env, XDG_STATE_HOME: value.state } });
    assert.equal(promoted.results[0]?.status, 'candidate'); assert.ok(promoted.results[0]?.blockers.includes('contradiction'));
    assert.equal(promoted.index.location, 'user');
    const index = JSON.parse(readFileSync(promoted.index.path!, 'utf8')) as { entries: { status: string }[] };
    assert.deepEqual(index.entries.map((entry) => entry.status), ['contradicted']);
    assert.deepEqual(applicableLearnedRules({ surface: 'product-dashboard' }, { projectRoot: value.root, environment: { ...process.env, XDG_STATE_HOME: value.state } }), []);
    assert.deepEqual(promoted.calibration, { predictions: 1, observations: 2, hits: 1, misses: 1, hitRate: 0.5 });
  } finally { rmSync(value.root, { recursive: true, force: true }); rmSync(value.state, { recursive: true, force: true }); }
});
