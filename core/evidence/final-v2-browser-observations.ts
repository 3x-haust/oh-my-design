import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  BrowserObservationDecisionLinkError,
  validateBrowserObservationArtifacts,
  validateBrowserObservationDecisionLinks,
} from '../runtime/browser-observation.ts';
import { readStableProjectFile, StableProjectFileReadError, type StableProjectFileSystem } from '../runtime/stable-project-file.ts';
import { observationV2Sha256, validateObservationV2 } from '../runtime/observation.ts';
import type { DesignQualityObservationBinding } from './final-v2-design-quality.ts';

export interface FinalBrowserObservationFs extends StableProjectFileSystem {}
export const DESIGN_QUALITY_OBSERVATION_PROJECTION_INPUT_SCHEMA =
  'design-quality-observation-projection-input-v1' as const;
export const DESIGN_QUALITY_OBSERVATION_PROJECTION_SCHEMA =
  'design-quality-observation-projection-v1' as const;
export type DesignQualityObservationProjection = Readonly<{
  schema: typeof DESIGN_QUALITY_OBSERVATION_PROJECTION_SCHEMA;
  observationSha256s: readonly string[];
  observations: readonly Readonly<{
    observationSha256: string;
    captureSha256: string;
    viewport: 'desktop' | 'mobile';
    state: string;
  }>[];
}>;
type StableReadContext = Readonly<{
  root: string;
  fs: FinalBrowserObservationFs;
  code: 'STALE_DECISION_GRAPH' | 'INVALID_OBSERVATION_ARTIFACT';
  label: string;
}>;

function fail(
  code: 'STALE_DECISION_GRAPH' | 'INVALID_OBSERVATION_ARTIFACT' | 'STALE_OBSERVATION_ARTIFACT',
  message: string,
): never {
  throw new BrowserObservationDecisionLinkError(code, message);
}
function readBrowserProjectFile(context: StableReadContext, path: string): Buffer {
  try { return readStableProjectFile({ root: context.root, fs: context.fs, path, label: context.label }); } catch (error) {
    if (error instanceof StableProjectFileReadError) fail(context.code, error.message);
    throw error;
  }
}

/**
 * Revalidates every final observation against stable decision-graph and screenshot bytes.
 * When aggregate observation digests are supplied, it also returns the trusted fixed-viewport
 * projection used to bind subjective design-quality evidence to actual current captures.
 */
export function validateFinalBrowserObservations(
  rootInput: string,
  fs: FinalBrowserObservationFs,
  evidence: readonly unknown[],
  observationSha256s: readonly string[] = [],
): readonly DesignQualityObservationBinding[] {
  const root = resolve(rootInput);
  if (observationSha256s.length !== 0 && observationSha256s.length !== evidence.length) {
    fail('INVALID_OBSERVATION_ARTIFACT', 'observation evidence and aggregate digest counts differ');
  }
  const decisionGraph = readBrowserProjectFile({ root, fs, code: 'STALE_DECISION_GRAPH', label: 'current design decision graph' }, fsPath(root, '.omd/decision-graph.json'));
  const bindings: DesignQualityObservationBinding[] = [];
  evidence.forEach((value, index) => {
    const links = validateBrowserObservationDecisionLinks(value, decisionGraph, true);
    if (links === undefined) fail('INVALID_OBSERVATION_ARTIFACT', `observation ${index} has no browser links`);
    validateBrowserObservationArtifacts(links, (path) => readBrowserProjectFile({ root, fs, code: 'INVALID_OBSERVATION_ARTIFACT', label: `observation ${index} browser capture` }, fsPath(root, path)), true);
    const observationSha256 = observationSha256s[index];
    if (observationSha256 === undefined) return;
    for (const observation of links.observations) {
      const viewport = observation.viewport.width === 1280
        && observation.viewport.height === 900
        ? 'desktop'
        : observation.viewport.width === 390
          && observation.viewport.height === 844
          ? 'mobile'
          : undefined;
      if (viewport === undefined) continue;
      bindings.push(Object.freeze({
        observationSha256,
        browserObservationSha256: observation.observationSha256,
        captureSha256: observation.observableResult.capture.sha256,
        viewport,
        state: observation.testedState,
      }));
    }
  });
  return Object.freeze(bindings);
}
function fsPath(root: string, projectPath: string): string { return resolve(root, ...projectPath.split('/')); }

/** Loads the exact aggregate observation records named by a reviewer handback. */
export function loadDesignQualityObservationBindings(
  rootInput: string,
  fs: FinalBrowserObservationFs,
  observationSha256s: readonly string[],
): readonly DesignQualityObservationBinding[] {
  const root = resolve(rootInput);
  const evidence = observationSha256s.map((sha256, index) => {
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      fail('INVALID_OBSERVATION_ARTIFACT', `observation ${index} aggregate digest is invalid`);
    }
    const bytes = readBrowserProjectFile({
      root,
      fs,
      code: 'INVALID_OBSERVATION_ARTIFACT',
      label: `observation ${index} aggregate record`,
    }, fsPath(root, `.omd/observation-v2/sha256-${sha256}.json`));
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
      fail('STALE_OBSERVATION_ARTIFACT', `observation ${index} aggregate bytes changed`);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')) as unknown; }
    catch { return fail('INVALID_OBSERVATION_ARTIFACT', `observation ${index} aggregate is not JSON`); }
    const observation = validateObservationV2(parsed);
    if (observationV2Sha256(observation) !== sha256) {
      fail('STALE_OBSERVATION_ARTIFACT', `observation ${index} aggregate semantics changed`);
    }
    return observation.evidence;
  });
  return validateFinalBrowserObservations(root, fs, evidence, observationSha256s);
}

/** Builds the source-free mapping that must be embedded in every final blind Eye input. */
export function buildDesignQualityObservationProjection(
  root: string,
  fs: FinalBrowserObservationFs,
  input: unknown,
): DesignQualityObservationProjection {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail('INVALID_OBSERVATION_ARTIFACT', 'design-quality observation projection input is not an object');
  }
  const fields = Reflect.ownKeys(input);
  if (
    fields.length !== 2
    || fields.some((key) =>
      typeof key !== 'string' || !['schema', 'observationSha256s'].includes(key))
  ) {
    fail('INVALID_OBSERVATION_ARTIFACT', 'design-quality observation projection input has unexpected fields');
  }
  const schema = Reflect.get(input, 'schema');
  const hashes = Reflect.get(input, 'observationSha256s');
  if (
    schema !== DESIGN_QUALITY_OBSERVATION_PROJECTION_INPUT_SCHEMA
    || !Array.isArray(hashes)
    || hashes.length === 0
    || hashes.some((value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    || new Set(hashes).size !== hashes.length
  ) {
    fail('INVALID_OBSERVATION_ARTIFACT', 'design-quality observation projection input is invalid');
  }
  const observationSha256s = hashes as string[];
  const bindings = loadDesignQualityObservationBindings(root, fs, observationSha256s);
  const seen = new Set<string>();
  const observations = bindings.flatMap((binding) => {
    const identity = [
      binding.observationSha256,
      binding.captureSha256,
      binding.viewport,
      binding.state,
    ].join(':');
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [Object.freeze({
      observationSha256: binding.observationSha256,
      captureSha256: binding.captureSha256,
      viewport: binding.viewport,
      state: binding.state,
    })];
  });
  if (observations.length === 0) {
    fail('INVALID_OBSERVATION_ARTIFACT', 'design-quality observation projection has no fixed captures');
  }
  return Object.freeze({
    schema: DESIGN_QUALITY_OBSERVATION_PROJECTION_SCHEMA,
    observationSha256s: Object.freeze([...observationSha256s]),
    observations: Object.freeze(observations),
  });
}
