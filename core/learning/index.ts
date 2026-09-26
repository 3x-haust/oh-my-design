import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile, type StableProjectFileSystem } from '../runtime/stable-project-file.ts';
import {
  evaluateValidatedLearning,
  publishValidatedLearning,
  validateLearningProposition,
  type LearningPromotionInput,
  type LearningPromotionResult,
  type LearningScope,
  type LearningValidation,
  type ReusableScopedRule,
} from '../coach/validated-learning.ts';
import { readUserLearningRuleIndex, writeUserLearningRuleIndex } from './user-rule-store.ts';

export const LEARNING_PREDICTION_SCHEMA = 'learning-prediction-v1' as const;
export const LEARNING_OBSERVATION_SCHEMA = 'learning-observation-v1' as const;
export const LEARNING_RULE_INDEX_SCHEMA = 'learning-rule-index-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_INDEX_PATH = '.omd/learning/rules-index.json';

type EvidenceReceipt = Readonly<{ path: string; sha256: string }>;
export type LearningPredictionInput = Readonly<{
  decisionId: string;
  surface: string;
  route: string;
  testedState: string;
  viewport: Readonly<{ width: number; height: number }>;
  predictedSignal: string;
}>;
export type LearningPrediction = Readonly<{
  schema: typeof LEARNING_PREDICTION_SCHEMA;
  decisionId: string;
  proposition: Readonly<{ id: string; statement: string; scope: LearningScope }>;
  predictedAt: string;
}>;
export type LearningObservationInput = Readonly<{
  predictionId: string;
  runId: string;
  contextId: string;
  outcome: 'validated' | 'contradicted';
  observedAt: string;
  decisionGraphPath: string;
  evidence: EvidenceReceipt;
}>;
export type LearningObservation = LearningObservationInput & Readonly<{
  schema: typeof LEARNING_OBSERVATION_SCHEMA;
}>;
export type LearningCalibration = Readonly<{
  predictions: number;
  observations: number;
  hits: number;
  misses: number;
  hitRate: number | null;
}>;
type LearningIndexEntry = Readonly<{
  id: string;
  status: 'promoted' | 'contradicted';
  proposition: LearningPrediction['proposition'];
  blockers: readonly string[];
  evaluatedAt: string;
  calibration: LearningCalibration;
  rule?: ReusableScopedRule;
}>;
export type LearningRuleIndex = Readonly<{
  schema: typeof LEARNING_RULE_INDEX_SCHEMA;
  updatedAt: string;
  entries: readonly LearningIndexEntry[];
}>;
export type LearningPromotionSummary = Readonly<{
  results: readonly LearningPromotionResult[];
  calibration: LearningCalibration;
  index: Readonly<{ location: 'user' | 'project' | 'unchanged'; path?: string }>;
}>;
export type ApplicableLearningScope = Readonly<{
  surface: string;
  route?: string;
  testedState?: string;
  viewport?: Readonly<{ width: number; height: number }>;
}>;
export type LearningEvidenceAdapter = Readonly<{
  schema: string;
  browserEvidence(value: Readonly<Record<string, unknown>>): unknown | undefined;
}>;
export type LearningLoopOptions = Readonly<{
  now?: string;
  fs?: StableProjectFileSystem;
  environment?: NodeJS.ProcessEnv;
  evidenceAdapters?: readonly LearningEvidenceAdapter[];
}>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => deepFreeze(Reflect.get(value, key)));
    Object.freeze(value);
  }
  return value;
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unknown or missing keys`);
  }
}
function safeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error(`${label} must be a lowercase kebab identifier`);
  return value;
}
function safePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || value.includes('\0')
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new Error(`${label} must be a safe project-relative path`);
  return value;
}
function omdPath(value: unknown, label: string): string {
  const path = safePath(value, label);
  if (!path.startsWith('.omd/')) throw new Error(`${label} must be under .omd`);
  return path;
}
function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}
function stableBytes(root: string, path: string, label: string, fs: StableProjectFileSystem): Buffer {
  return readStableProjectFile({ root, path: resolve(root, path), label, fs });
}
function parseJson(bytes: Uint8Array, label: string): unknown {
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown; }
  catch { throw new Error(`${label} must contain JSON`); }
}
function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function predictionPath(id: string): string { return `.omd/learning/predictions/${id}.json`; }
function observationsDirectory(id: string): string { return `.omd/learning/observations/${id}`; }

function parsePrediction(value: unknown): LearningPrediction {
  const item = record(value, 'learning prediction');
  exact(item, ['schema', 'decisionId', 'proposition', 'predictedAt'], 'learning prediction');
  if (item.schema !== LEARNING_PREDICTION_SCHEMA) throw new Error('learning prediction schema is invalid');
  const proposition = validateLearningProposition(deepFreeze(structuredClone(item.proposition)));
  const decisionId = safeId(item.decisionId, 'learning prediction decisionId');
  if (decisionId !== proposition.id) throw new Error('learning prediction decisionId must match proposition id');
  return deepFreeze({ schema: LEARNING_PREDICTION_SCHEMA, decisionId, proposition, predictedAt: timestamp(item.predictedAt, 'learning prediction predictedAt') });
}
function parseObservation(value: unknown): LearningObservation {
  const item = record(value, 'learning observation');
  exact(item, ['schema', 'predictionId', 'runId', 'contextId', 'outcome', 'observedAt', 'decisionGraphPath', 'evidence'], 'learning observation');
  const evidence = record(item.evidence, 'learning observation evidence'); exact(evidence, ['path', 'sha256'], 'learning observation evidence');
  if (item.schema !== LEARNING_OBSERVATION_SCHEMA) throw new Error('learning observation schema is invalid');
  if (item.outcome !== 'validated' && item.outcome !== 'contradicted') throw new Error('learning observation outcome is invalid');
  if (typeof evidence.sha256 !== 'string' || !SHA256.test(evidence.sha256)) throw new Error('learning observation evidence sha256 is invalid');
  return deepFreeze({
    schema: LEARNING_OBSERVATION_SCHEMA,
    predictionId: safeId(item.predictionId, 'learning observation predictionId'),
    runId: safeId(item.runId, 'learning observation runId'),
    contextId: safeId(item.contextId, 'learning observation contextId'),
    outcome: item.outcome,
    observedAt: timestamp(item.observedAt, 'learning observation observedAt'),
    decisionGraphPath: omdPath(item.decisionGraphPath, 'learning observation decisionGraphPath'),
    evidence: { path: omdPath(evidence.path, 'learning observation evidence path'), sha256: evidence.sha256 },
  });
}
function browserEvidenceFrom(value: unknown, adapters: readonly LearningEvidenceAdapter[]): unknown {
  const input = record(value, 'learning evidence');
  if ('browserObservations' in input) return { browserObservations: input.browserObservations };
  if (input.schema === 'browser-observation-set-v1') return { browserObservations: input };
  for (const adapter of adapters) if (input.schema === adapter.schema) {
    const adapted = adapter.browserEvidence(input);
    if (adapted !== undefined) return adapted;
  }
  for (const key of ['evidence', 'finalEvidence', 'browserEvidence']) {
    const nested = input[key];
    if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      if ('browserObservations' in nestedRecord) return { browserObservations: nestedRecord.browserObservations };
    }
  }
  throw new Error(`learning evidence schema ${String(input.schema ?? '(unlabelled)')} has no authenticated browser observation adapter`);
}
function validationFor(root: string, observation: LearningObservation, options: LearningLoopOptions): LearningValidation {
  const fs = options.fs ?? nodeStableProjectFileSystem();
  const evidenceBytes = stableBytes(root, observation.evidence.path, 'learning evidence artifact', fs);
  if (digest(evidenceBytes) !== observation.evidence.sha256) throw new Error('learning evidence artifact digest does not match its receipt');
  return deepFreeze({
    runId: observation.runId, contextId: observation.contextId, outcome: observation.outcome,
    observedAt: observation.observedAt, decisionGraphPath: observation.decisionGraphPath,
    browserEvidence: browserEvidenceFrom(parseJson(evidenceBytes, 'learning evidence artifact'), options.evidenceAdapters ?? []),
  });
}
function evaluated(root: string, prediction: LearningPrediction, observations: readonly LearningObservation[], options: LearningLoopOptions): LearningPromotionResult {
  const validations = observations.map((observation) => validationFor(root, observation, options));
  const input: LearningPromotionInput = deepFreeze({ schema: 'validated-learning-promotion-input-v1', proposition: prediction.proposition, validations });
  return evaluateValidatedLearning(input, {
    now: options.now ?? new Date().toISOString(), projectRoot: root, fs: options.fs ?? nodeStableProjectFileSystem(),
    idFor: (sha256) => `learning-${sha256.slice(0, 16)}`,
  });
}
function readPrediction(root: string, id: string, fs: StableProjectFileSystem): LearningPrediction {
  return parsePrediction(parseJson(stableBytes(root, predictionPath(id), `learning prediction ${id}`, fs), `learning prediction ${id}`));
}
function readObservations(root: string, id: string, fs: StableProjectFileSystem): readonly LearningObservation[] {
  const directory = resolve(root, observationsDirectory(id));
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((name) => {
    const path = `${observationsDirectory(id)}/${name}`;
    return parseObservation(parseJson(stableBytes(root, path, `learning observation ${name}`, fs), `learning observation ${name}`));
  });
}
function calibration(predictions: number, observations: readonly LearningObservation[]): LearningCalibration {
  const hits = observations.filter((entry) => entry.outcome === 'validated').length;
  const misses = observations.length - hits;
  return deepFreeze({ predictions, observations: observations.length, hits, misses, hitRate: observations.length === 0 ? null : hits / observations.length });
}
function parseIndex(value: unknown): LearningRuleIndex {
  const item = record(value, 'learning rule index');
  if (item.schema !== LEARNING_RULE_INDEX_SCHEMA || !Array.isArray(item.entries) || typeof item.updatedAt !== 'string') throw new Error('learning rule index is malformed');
  const entries = item.entries.map((raw): LearningIndexEntry => {
    const entry = record(raw, 'learning rule index entry');
    if (entry.status !== 'promoted' && entry.status !== 'contradicted') throw new Error('learning rule index status is invalid');
    const proposition = validateLearningProposition(deepFreeze(structuredClone(entry.proposition)));
    if (!Array.isArray(entry.blockers) || entry.blockers.some((value) => typeof value !== 'string')) throw new Error('learning rule index blockers are invalid');
    if (typeof entry.id !== 'string' || typeof entry.evaluatedAt !== 'string') throw new Error('learning rule index identity is invalid');
    if (entry.status === 'promoted' && (typeof entry.rule !== 'object' || entry.rule === null)) throw new Error('promoted learning index entry has no rule');
    return deepFreeze({ id: entry.id, status: entry.status, proposition, blockers: [...entry.blockers], evaluatedAt: entry.evaluatedAt,
      calibration: entry.calibration as LearningCalibration, ...(entry.status === 'promoted' ? { rule: entry.rule as ReusableScopedRule } : {}) });
  });
  return deepFreeze({ schema: LEARNING_RULE_INDEX_SCHEMA, updatedAt: timestamp(item.updatedAt, 'learning rule index updatedAt'), entries });
}
function readProjectIndex(root: string, fs: StableProjectFileSystem): LearningRuleIndex | undefined {
  if (!existsSync(resolve(root, PROJECT_INDEX_PATH))) return undefined;
  return parseIndex(parseJson(stableBytes(root, PROJECT_INDEX_PATH, 'project learning rule index', fs), 'project learning rule index'));
}
function currentIndex(root: string, options: LearningLoopOptions): LearningRuleIndex | undefined {
  try {
    const user = readUserLearningRuleIndex(options.environment);
    if (user !== undefined) return parseIndex(user);
  } catch { /* unavailable or invalid user state falls back to the project index */ }
  return readProjectIndex(root, options.fs ?? nodeStableProjectFileSystem());
}

export function recordLearningPrediction(root: string, input: LearningPredictionInput, writer: ProjectWriteAdapter, now = new Date().toISOString()): LearningPrediction {
  const adapter = requireProjectWriteAdapter(root, writer);
  const raw = record(input, 'learning prediction input');
  exact(raw, ['decisionId', 'surface', 'route', 'testedState', 'viewport', 'predictedSignal'], 'learning prediction input');
  const proposition = validateLearningProposition(deepFreeze({
    id: input.decisionId, statement: input.predictedSignal,
    scope: { surface: input.surface, route: input.route, testedState: input.testedState, viewport: { ...input.viewport } },
  }));
  const prediction = deepFreeze({ schema: LEARNING_PREDICTION_SCHEMA, decisionId: proposition.id, proposition, predictedAt: timestamp(now, 'prediction time') });
  adapter.write(predictionPath(proposition.id), `${canonicalJson(prediction)}\n`);
  return prediction;
}

export function recordLearningObservation(root: string, input: LearningObservationInput, writer: ProjectWriteAdapter, options: LearningLoopOptions = {}): LearningObservation {
  const adapter = requireProjectWriteAdapter(root, writer);
  const observation = parseObservation(deepFreeze({ schema: LEARNING_OBSERVATION_SCHEMA, ...structuredClone(input) }));
  const prediction = readPrediction(root, observation.predictionId, options.fs ?? nodeStableProjectFileSystem());
  evaluated(root, prediction, [observation], { ...options, now: observation.observedAt });
  const identity = createHash('sha256').update(canonicalJson(observation)).digest('hex').slice(0, 16);
  adapter.write(`${observationsDirectory(observation.predictionId)}/${observation.runId}-${observation.contextId}-${identity}.json`, `${canonicalJson(observation)}\n`);
  return observation;
}

export function promoteLearnings(root: string, writer: ProjectWriteAdapter, options: LearningLoopOptions = {}): LearningPromotionSummary {
  const adapter = requireProjectWriteAdapter(root, writer);
  const fs = options.fs ?? nodeStableProjectFileSystem();
  const directory = resolve(root, '.omd/learning/predictions');
  const predictionIds = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((name) => name.slice(0, -5)) : [];
  const results: LearningPromotionResult[] = [];
  const allObservations: LearningObservation[] = [];
  let index = currentIndex(root, options) ?? deepFreeze({ schema: LEARNING_RULE_INDEX_SCHEMA, updatedAt: options.now ?? new Date().toISOString(), entries: [] });
  let changed = false;
  for (const id of predictionIds) {
    const prediction = readPrediction(root, id, fs);
    const observations = readObservations(root, id, fs);
    if (observations.length === 0) continue;
    allObservations.push(...observations);
    const result = evaluated(root, prediction, observations, options);
    results.push(result);
    publishValidatedLearning(root, result, adapter);
    const contradicted = result.blockers.includes('contradiction');
    if (result.status !== 'promoted' && !contradicted) continue;
    const entry: LearningIndexEntry = deepFreeze({
      id: result.id, status: result.status === 'promoted' ? 'promoted' : 'contradicted', proposition: result.proposition,
      blockers: result.blockers, evaluatedAt: result.evaluatedAt, calibration: calibration(1, observations),
      ...(result.status === 'promoted' ? { rule: result.rule } : {}),
    });
    index = deepFreeze({ schema: LEARNING_RULE_INDEX_SCHEMA, updatedAt: options.now ?? new Date().toISOString(),
      entries: [...index.entries.filter((existing) => existing.proposition.id !== entry.proposition.id), entry].sort((left, right) => left.id.localeCompare(right.id)) });
    changed = true;
  }
  let location: LearningPromotionSummary['index'] = { location: 'unchanged' };
  if (changed) {
    const bytes = Buffer.from(`${canonicalJson(index)}\n`);
    try { location = { location: 'user', path: writeUserLearningRuleIndex(bytes, options.environment) }; }
    catch {
      adapter.write(PROJECT_INDEX_PATH, bytes);
      location = { location: 'project', path: PROJECT_INDEX_PATH };
    }
  }
  return deepFreeze({ results, calibration: calibration(predictionIds.length, allObservations), index: location });
}

/** Loads advisory promoted rules from the user store, falling back to the current project. */
export function applicableLearnedRules(scope: ApplicableLearningScope, options: LearningLoopOptions & Readonly<{ projectRoot?: string }> = {}): readonly ReusableScopedRule[] {
  const root = options.projectRoot ?? process.cwd();
  const index = currentIndex(root, options);
  if (index === undefined) return [];
  return deepFreeze(index.entries.flatMap((entry): readonly ReusableScopedRule[] => {
    if (entry.status !== 'promoted' || entry.rule === undefined || entry.rule.scope.surface !== scope.surface) return [];
    if (scope.route !== undefined && entry.rule.scope.route !== scope.route) return [];
    if (scope.testedState !== undefined && entry.rule.scope.testedState !== scope.testedState) return [];
    if (scope.viewport !== undefined && (entry.rule.scope.viewport.width !== scope.viewport.width || entry.rule.scope.viewport.height !== scope.viewport.height)) return [];
    return [entry.rule];
  }));
}
