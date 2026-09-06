import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import {
  FUNCTIONAL_REQUIREMENTS_SCHEMA,
  FUNCTIONAL_REQUIREMENTS_V2_SCHEMA,
  checkFunctionalCompleteness,
  parseFunctionalRequirements,
  type CompletenessFinding,
} from '../completeness/index.ts';
import type { RawNode } from '../types.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import {
  requireProductProbeResultAuthorization,
  type ProjectRunInvocation,
} from '../runtime/invocation.ts';
import {
  acquireProjectMutationLock,
  replaceProjectFileAtomically,
  writeContentAddressedProjectFile,
} from '../runtime/project-write.ts';
import {
  nodeStableProjectFileSystem,
  readStableProjectFile,
} from '../runtime/stable-project-file.ts';
import { validateBrowserObservationArtifacts, validateBrowserObservationDecisionLinks } from '../runtime/browser-observation.ts';
import { validateObservationV2 } from '../runtime/observation.ts';
import { validateSourceSeal, validateSourceSealArtifact } from '../source-seal/index.ts';
import type { AdaptiveSourceSealRoute } from '../source-seal/adaptive-inputs.ts';

export const LEGACY_COMPLETENESS_RUN_INPUT_SCHEMA = 'functional-completeness-run-input-v1' as const;
export const LEGACY_COMPLETENESS_RUN_SCHEMA = 'functional-completeness-run-v1' as const;
export const COMPLETENESS_RUN_INPUT_SCHEMA = 'functional-completeness-run-input-v2' as const;
export const COMPLETENESS_RUN_SCHEMA = 'functional-completeness-run-v2' as const;
export const WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA = 'functional-completeness-run-input-v3' as const;
export const WORKFLOW_COMPLETENESS_RUN_SCHEMA = 'functional-completeness-run-v3' as const;
export const COMPLETENESS_CURRENT_SCHEMA = 'functional-completeness-current-v1' as const;
export const TYPOGRAPHY_APPLICABILITY_SCHEMA = 'typography-applicability-v1' as const;
export const MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA = 'typography-applicability-v2' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const STATE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_RECORD = /^completeness-runs\/sha256-([a-f0-9]{64})\.json$/;
const fs = nodeStableProjectFileSystem();

export type CompletionArtifactReceipt = Readonly<{ path: string; schema: string; sha256: string }>;
type TypographyApplicabilityCore = Readonly<{
  renderedIrSha256: string;
  buildSha256: string;
  sourceSkillSha256: string;
  testedUrl: string;
  koreanDisplayText: boolean;
}>;
export type TypographyApplicabilityEvidence =
  | Readonly<TypographyApplicabilityCore & { schema: typeof TYPOGRAPHY_APPLICABILITY_SCHEMA }>
  | Readonly<TypographyApplicabilityCore & {
    schema: typeof MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA;
    requirementsSha256: string;
    functionalFindings: readonly CompletenessFinding[];
  }>;
export type CompletenessViewport = Readonly<{ width: number; height: number }>;
export type CompletenessRunInput = Readonly<{
  schema: typeof COMPLETENESS_RUN_INPUT_SCHEMA | typeof WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA;
  requirements: CompletionArtifactReceipt;
  buildIdentity: CompletionArtifactReceipt;
  sourceSeal: CompletionArtifactReceipt;
  typographyApplicability: CompletionArtifactReceipt;
  testedUrl: string;
  testedState: string;
  viewports: readonly CompletenessViewport[];
  observations: readonly CompletionArtifactReceipt[];
  findings: readonly CompletenessFinding[];
}>;
export type CompletenessRun = Readonly<{
  schema: typeof LEGACY_COMPLETENESS_RUN_SCHEMA | typeof COMPLETENESS_RUN_SCHEMA | typeof WORKFLOW_COMPLETENESS_RUN_SCHEMA;
  requirements: CompletionArtifactReceipt;
  buildIdentity: CompletionArtifactReceipt;
  sourceSeal: CompletionArtifactReceipt;
  typographyApplicability?: CompletionArtifactReceipt;
  testedUrl: string;
  testedState: string;
  viewports: readonly CompletenessViewport[];
  observations: readonly CompletionArtifactReceipt[];
  findings: readonly [];
  build: Readonly<{ buildSha256: string; sourceSkillSha256: string }>;
}>;
export type CompletenessCurrentPointer = Readonly<{
  schema: typeof COMPLETENESS_CURRENT_SCHEMA;
  record: string;
  sha256: string;
}>;

export class CompletenessEvidenceError extends Error {
  override readonly name = 'CompletenessEvidenceError';
  constructor(reason: string) { super(`functional completeness evidence: ${reason}`); }
}
const fail = (reason: string): never => { throw new CompletenessEvidenceError(reason); };
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function object(value: unknown, label: string): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
    const input = value as object;
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) fail(`${label} must not inherit input properties`);
    const own = Reflect.ownKeys(input);
    if (own.some((key) => typeof key !== 'string')) fail(`${label} must not contain Symbol keys`);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of own) {
      const name = typeof key === 'string' ? key : fail(`${label} must not contain Symbol keys`);
      const descriptor = Reflect.getOwnPropertyDescriptor(input, name) ?? fail(`${label} property disappeared while inspecting`);
      if (!descriptor.enumerable || !('value' in descriptor)) fail(`${label} must contain enumerable own data properties only`);
      result[name] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof CompletenessEvidenceError) throw error;
    return fail(`${label} could not be inspected safely`);
  }
}
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has unknown or missing keys`);
}
function values(value: unknown, label: string): readonly unknown[] {
  try {
    if (!Array.isArray(value)) fail(`${label} must be an array`);
    const input = value as unknown[];
    if (Reflect.getPrototypeOf(input) !== Array.prototype) fail(`${label} must be an array`);
    const own = Reflect.ownKeys(input);
    const expected = Array.from({ length: input.length }, (_, index) => String(index));
    if (own.length !== expected.length + 1 || own.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) fail(`${label} must be dense and undecorated`);
    const length = Reflect.getOwnPropertyDescriptor(input, 'length');
    if (length === undefined || !('value' in length) || length.enumerable) fail(`${label} must be dense and undecorated`);
    return expected.map((key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key) ?? fail(`${label} entry disappeared while inspecting`);
      if (!descriptor.enumerable || !('value' in descriptor)) fail(`${label} must contain data entries only`);
      return descriptor.value;
    });
  } catch (error) {
    if (error instanceof CompletenessEvidenceError) throw error;
    return fail(`${label} could not be inspected safely`);
  }
}
function jsonSnapshot(value: unknown, label: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fail(`${label} contains a non-finite number`);
  if (Array.isArray(value)) return values(value, label).map((item, index) => jsonSnapshot(item, `${label}[${index}]`));
  const item = object(value, label);
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(item)) result[key] = jsonSnapshot(child, `${label}.${key}`);
  return result;
}
function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be a SHA-256 digest`);
  return value as string;
}
function safePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || value.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a normalized project-relative path`);
  return value as string;
}
function receipt(value: unknown, label: string, schemas: readonly string[]): CompletionArtifactReceipt {
  const item = object(value, label); exact(item, ['path', 'schema', 'sha256'], label);
  if (typeof item.schema !== 'string' || !schemas.includes(item.schema)) fail(`${label}.schema is invalid`);
  const schema = item.schema as string;
  return Object.freeze({ path: safePath(item.path, `${label}.path`), schema, sha256: digest(item.sha256, `${label}.sha256`) });
}
function viewport(value: unknown, label: string): CompletenessViewport {
  const item = object(value, label); exact(item, ['width', 'height'], label);
  if (typeof item.width !== 'number' || !Number.isSafeInteger(item.width) || item.width < 1 || item.width > 16384
    || typeof item.height !== 'number' || !Number.isSafeInteger(item.height) || item.height < 1 || item.height > 16384) fail(`${label} is invalid`);
  return Object.freeze({ width: item.width as number, height: item.height as number });
}
function viewports(value: unknown): readonly CompletenessViewport[] {
  const items = values(value, 'viewports');
  if (items.length === 0) fail('at least one tested viewport is required');
  const result = Object.freeze(items.map((item, index) => viewport(item, `viewports[${index}]`)));
  if (new Set(result.map(({ width, height }) => `${width}x${height}`)).size !== result.length) fail('tested viewports must be unique');
  return result;
}
function observations(value: unknown): readonly CompletionArtifactReceipt[] {
  const items = values(value, 'observations');
  if (items.length === 0) fail('at least one observation is required');
  const result = Object.freeze(items.map((item, index) => receipt(item, `observations[${index}]`, ['observation-v2'])));
  if (new Set(result.map((item) => item.path)).size !== result.length) fail('observation paths must be unique');
  return result;
}
function testedUrl(value: unknown): string {
  if (typeof value !== 'string') fail('testedUrl must be an absolute browser URL');
  const input = value as string;
  try {
    const url = new URL(input);
    if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.username !== '' || url.password !== '' || url.hash !== '' || url.href !== input) fail('testedUrl must be a canonical browser URL without credentials or fragment');
    return input;
  } catch (error) { if (error instanceof CompletenessEvidenceError) throw error; return fail('testedUrl must be an absolute browser URL'); }
}
function testedState(value: unknown): string {
  if (typeof value !== 'string' || !STATE.test(value)) fail('testedState must be a normalized state identifier');
  return value as string;
}
function stableRead(root: string, path: string, label: string): Buffer {
  try { return readStableProjectFile({ root, path: resolve(root, path), label, fs }); }
  catch { return fail(`${label} could not be read stably`); }
}
function backed(root: string, descriptor: CompletionArtifactReceipt, label: string): Buffer {
  const bytes = stableRead(root, descriptor.path, label);
  if (hash(bytes) !== descriptor.sha256) fail(`${label} bytes changed`);
  return bytes;
}
function parseJson(bytes: Uint8Array, label: string): unknown {
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return fail(`${label} is not JSON`); }
}
function finding(value: unknown, label: string): CompletenessFinding {
  const item = object(value, label); exact(item, ['id', 'requirement', 'message'], label);
  if (typeof item.id !== 'string' || !/^FUNC-(?:MISSING|FORM-INERT|INERT|UNREACHABLE)$/.test(item.id)
    || typeof item.requirement !== 'string' || !/^R-\d+$/.test(item.requirement)
    || typeof item.message !== 'string' || item.message.trim() === '') fail(`${label} is invalid`);
  return Object.freeze({ id: item.id as string, requirement: item.requirement as string, message: item.message as string });
}
function findings(value: unknown, label: string): readonly CompletenessFinding[] {
  return Object.freeze(values(value, label).map((item, index) => finding(item, `${label}[${index}]`)));
}
function typographyApplicabilityValue(value: unknown): TypographyApplicabilityEvidence {
  const item = object(value, 'typography applicability');
  const measured = item.schema === MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA;
  exact(item, measured
    ? ['schema', 'renderedIrSha256', 'buildSha256', 'sourceSkillSha256', 'testedUrl', 'koreanDisplayText', 'requirementsSha256', 'functionalFindings']
    : ['schema', 'renderedIrSha256', 'buildSha256', 'sourceSkillSha256', 'testedUrl', 'koreanDisplayText'], 'typography applicability');
  if (!measured && item.schema !== TYPOGRAPHY_APPLICABILITY_SCHEMA) fail('typography applicability schema is invalid');
  if (typeof item.koreanDisplayText !== 'boolean') fail('typography applicability koreanDisplayText must be boolean');
  const core = {
    renderedIrSha256: digest(item.renderedIrSha256, 'typography applicability renderedIrSha256'),
    buildSha256: digest(item.buildSha256, 'typography applicability buildSha256'),
    sourceSkillSha256: digest(item.sourceSkillSha256, 'typography applicability sourceSkillSha256'),
    testedUrl: testedUrl(item.testedUrl),
    koreanDisplayText: item.koreanDisplayText as boolean,
  };
  return measured
    ? Object.freeze({ schema: MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA, ...core, requirementsSha256: digest(item.requirementsSha256, 'typography applicability requirementsSha256'), functionalFindings: findings(item.functionalFindings, 'typography applicability functionalFindings') })
    : Object.freeze({ schema: TYPOGRAPHY_APPLICABILITY_SCHEMA, ...core });
}

/** Reads and validates immutable historical or measured typography-applicability evidence. */
export function checkTypographyApplicability(root: string, descriptor: CompletionArtifactReceipt): TypographyApplicabilityEvidence {
  const validated = receipt(descriptor, 'typographyApplicability', [TYPOGRAPHY_APPLICABILITY_SCHEMA, MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA]);
  const evidence = typographyApplicabilityValue(parseJson(backed(root, validated, 'typography applicability'), 'typography applicability'));
  if (evidence.schema !== validated.schema) fail('typography applicability descriptor schema does not match its bytes');
  return evidence;
}

function functionalNodes(value: unknown): Readonly<{ nodes: readonly RawNode[]; koreanDisplayText: boolean }> {
  const entries = values(value, 'rendered IR nodes');
  if (entries.length === 0) fail('rendered IR must contain at least one node');
  const ids = new Set<string>();
  let koreanDisplayText = false;
  const nodes = entries.map((value, index): RawNode => {
    const node = object(value, `rendered IR node ${index}`);
    const idValue = node.id;
    if (typeof idValue !== 'string' || idValue === '' || ids.has(idValue)) fail('rendered IR node ids must be unique non-empty strings');
    const id = idValue as string;
    ids.add(id);
    if (node.type !== 'FRAME' && node.type !== 'TEXT') fail(`rendered IR node ${index} type is invalid`);
    const type = node.type as RawNode['type'];
    if (node.parent !== null && typeof node.parent !== 'string') fail(`rendered IR node ${index} parent is invalid`);
    const children = values(node.children, `rendered IR node ${index} children`);
    if (children.some((child) => typeof child !== 'string') || new Set(children).size !== children.length) fail(`rendered IR node ${index} children are invalid`);
    const childIds = children as readonly string[];
    if (node.text !== undefined && typeof node.text !== 'string') fail(`rendered IR node ${index} text is invalid`);
    if (node.displayText !== undefined && typeof node.displayText !== 'boolean') fail(`rendered IR node ${index} displayText is invalid`);
    if (node.interactive !== undefined && typeof node.interactive !== 'boolean') fail(`rendered IR node ${index} interactive is invalid`);
    if (node.focusable !== undefined && typeof node.focusable !== 'boolean') fail(`rendered IR node ${index} focusable is invalid`);
    if (node.type === 'TEXT' && node.displayText === true && typeof node.text === 'string' && /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(node.text)) koreanDisplayText = true;
    return Object.freeze({
      id,
      name: typeof node.name === 'string' ? node.name : id,
      type,
      path: typeof node.path === 'string' ? node.path : id,
      parent: node.parent as string | null,
      children: [...childIds],
      box: { x: 0, y: 0, w: 0, h: 0 },
      ...(typeof node.text === 'string' ? { text: node.text } : {}),
      ...(typeof node.interactive === 'boolean' ? { interactive: node.interactive } : {}),
      ...(typeof node.focusable === 'boolean' ? { focusable: node.focusable } : {}),
    });
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (node.parent !== null) {
      const parent = byId.get(node.parent) ?? fail(`rendered IR node ${node.id} references an unknown parent`);
      if (!parent.children.includes(node.id)) fail(`rendered IR node ${node.id} parent and child links disagree`);
    }
    for (const childId of node.children) {
      const child = byId.get(childId) ?? fail(`rendered IR node ${node.id} references an unknown child`);
      if (child.parent !== node.id) fail(`rendered IR node ${node.id} parent and child links disagree`);
    }
    const ancestors = new Set<string>();
    let current: RawNode | undefined = node;
    while (current !== undefined && current.parent !== null) {
      if (ancestors.has(current.id)) fail('rendered IR node graph must be acyclic');
      ancestors.add(current.id);
      current = byId.get(current.parent);
    }
  }
  return Object.freeze({ nodes: Object.freeze(nodes), koreanDisplayText });
}

/** Derives and publishes typography applicability and functional findings from the same measured IR. */
export function renderedIrEvidenceBytes(renderedIr: unknown): Buffer {
  return Buffer.from(`${canonicalJson(jsonSnapshot(renderedIr, 'rendered IR'))}\n`);
}

export function publishTypographyApplicability(root: string, renderedIr: unknown, invocation: ProjectRunInvocation): CompletionArtifactReceipt {
  const normalized = jsonSnapshot(renderedIr, 'rendered IR');
  requireProductProbeResultAuthorization(invocation, root, renderedIrEvidenceBytes(normalized));
  const ir = object(normalized, 'rendered IR');
  const meta = object(ir.meta, 'rendered IR meta');
  if (meta.source !== 'dom') fail('rendered IR must identify the DOM renderer');
  if (typeof meta.url !== 'string') fail('rendered IR must identify its canonical URL');
  const renderedUrl = testedUrl(meta.url);
  const measured = functionalNodes(ir.nodes);
  const requirementsBytes = stableRead(root, '.omd/functional-requirements.json', 'functional requirements');
  const requirements = parseFunctionalRequirements(parseJson(requirementsBytes, 'functional requirements'));
  const evidence: TypographyApplicabilityEvidence = Object.freeze({
    schema: MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA,
    renderedIrSha256: hash(canonicalJson(normalized)),
    buildSha256: invocation.current.buildSha256,
    sourceSkillSha256: invocation.current.loadedSkillSha256,
    testedUrl: renderedUrl,
    koreanDisplayText: measured.koreanDisplayText,
    requirementsSha256: hash(requirementsBytes),
    functionalFindings: Object.freeze(checkFunctionalCompleteness(requirements, measured.nodes)),
  });
  const bytes = `${canonicalJson(evidence)}\n`;
  const evidenceSha256 = hash(bytes);
  const path = `.omd/typography-applicability/sha256-${evidenceSha256}.json`;
  writeContentAddressedProjectFile({ projectRoot: root, relativePath: path, content: bytes, invocation });
  return Object.freeze({ path, schema: MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA, sha256: evidenceSha256 });
}

function build(value: unknown): Readonly<{ buildSha256: string; sourceSkillSha256: string }> {
  const item = object(value, 'build identity');
  exact(item, ['schemaVersion', 'packageVersion', 'buildSha256', 'sourceSkillSha256'], 'build identity');
  if (item.schemaVersion !== 'omd-build-identity-v1' || typeof item.packageVersion !== 'string') fail('build identity schema is invalid');
  return Object.freeze({ buildSha256: digest(item.buildSha256, 'build identity buildSha256'), sourceSkillSha256: digest(item.sourceSkillSha256, 'build identity sourceSkillSha256') });
}
function validateRequirementsEvidence(value: ReturnType<typeof parseFunctionalRequirements>, state: string, testedViewports: readonly CompletenessViewport[]): void {
  if (value.schema !== FUNCTIONAL_REQUIREMENTS_V2_SCHEMA) return;
  if (canonicalJson(value.evidence.states) !== canonicalJson([state])) fail('tested state does not match the exact requirements');
  const required = value.evidence.viewports.map(({ width, height }) => `${width}x${height}`).sort();
  const actual = testedViewports.map(({ width, height }) => `${width}x${height}`).sort();
  if (canonicalJson(required) !== canonicalJson(actual)) fail('tested viewports do not match the exact requirements');
}
function validateObservationSet(root: string, descriptors: readonly CompletionArtifactReceipt[], url: string, state: string, testedViewports: readonly CompletenessViewport[], buildSha256: string): void {
  const decisionGraph = stableRead(root, '.omd/decision-graph.json', 'current decision graph');
  const observed = new Set<string>();
  for (const [index, descriptor] of descriptors.entries()) {
    const value = validateObservationV2(parseJson(backed(root, descriptor, `observation ${index}`), `observation ${index}`));
    if (value.buildSha256 !== buildSha256) fail(`observation ${index} build is stale`);
    const links = validateBrowserObservationDecisionLinks(value.evidence, decisionGraph, true)
      ?? fail(`observation ${index} has no browser evidence`);
    validateBrowserObservationArtifacts(links, (path) => stableRead(root, path, `observation ${index} capture`), true);
    for (const observation of links.observations) {
      if (observation.testedUrl !== url || observation.testedState !== state) fail(`observation ${index} URL or state is stale`);
      observed.add(`${observation.viewport.width}x${observation.viewport.height}`);
    }
  }
  const required = testedViewports.map(({ width, height }) => `${width}x${height}`).sort();
  if (canonicalJson([...observed].sort()) !== canonicalJson(required)) fail('observation viewports do not match tested viewports');
}
function validateRun(
  root: string,
  value: unknown,
  invocation: ProjectRunInvocation,
  requireMeasured = false,
  continuationRoute?: AdaptiveSourceSealRoute,
): CompletenessRun {
  const item = object(value, 'run');
  const legacy = item.schema === LEGACY_COMPLETENESS_RUN_SCHEMA;
  exact(item, legacy
    ? ['schema', 'requirements', 'buildIdentity', 'sourceSeal', 'testedUrl', 'testedState', 'viewports', 'observations', 'findings', 'build']
    : ['schema', 'requirements', 'buildIdentity', 'sourceSeal', 'typographyApplicability', 'testedUrl', 'testedState', 'viewports', 'observations', 'findings', 'build'], 'run');
  const workflow = item.schema === WORKFLOW_COMPLETENESS_RUN_SCHEMA;
  if (!legacy && !workflow && item.schema !== COMPLETENESS_RUN_SCHEMA) fail('run schema is invalid');
  const requirements = receipt(item.requirements, 'requirements', [FUNCTIONAL_REQUIREMENTS_SCHEMA, FUNCTIONAL_REQUIREMENTS_V2_SCHEMA]);
  const buildIdentity = receipt(item.buildIdentity, 'buildIdentity', ['omd-build-identity-v1']);
  const sourceSeal = receipt(item.sourceSeal, 'sourceSeal', workflow ? ['source-seal-v2'] : ['source-seal-v1']);
  const typographyApplicability = legacy
    ? undefined
    : receipt(item.typographyApplicability, 'typographyApplicability', [TYPOGRAPHY_APPLICABILITY_SCHEMA, MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA]);
  const applicabilityEvidence = typographyApplicability === undefined
    ? undefined
    : checkTypographyApplicability(root, typographyApplicability);
  const url = testedUrl(item.testedUrl); const state = testedState(item.testedState); const testedViewports = viewports(item.viewports); const observationReceipts = observations(item.observations);
  if (values(item.findings, 'run findings').length !== 0) fail('a completeness run requires zero findings');
  const requirementsBytes = backed(root, requirements, 'requirements');
  const requirementsDocument = parseFunctionalRequirements(parseJson(requirementsBytes, 'requirements'));
  if (requirementsDocument.schema !== requirements.schema) fail('requirements descriptor schema does not match its bytes');
  if (applicabilityEvidence?.schema === MEASURED_TYPOGRAPHY_APPLICABILITY_SCHEMA) {
    if (applicabilityEvidence.requirementsSha256 !== hash(requirementsBytes)) fail('functional completeness measurement does not bind the exact requirements');
    if (applicabilityEvidence.functionalFindings.length !== 0) {
      fail(`measured functional completeness has findings: ${applicabilityEvidence.functionalFindings.map((finding) => `${finding.id} ${finding.requirement}`).join(', ')}`);
    }
  } else if (requireMeasured) {
    fail('new completeness publication requires computed functional findings from rendered IR');
  }
  validateRequirementsEvidence(requirementsDocument, state, testedViewports);
  const observedBuild = build(parseJson(backed(root, buildIdentity, 'build identity'), 'build identity'));
  const recordedBuild = build({ schemaVersion: 'omd-build-identity-v1', packageVersion: '', ...object(item.build, 'build') });
  if (canonicalJson(observedBuild) !== canonicalJson(recordedBuild)) fail('recorded build binding is stale');
  if (observedBuild.buildSha256 !== invocation.current.buildSha256 || observedBuild.sourceSkillSha256 !== invocation.current.loadedSkillSha256) fail('build and source skill are not current');
  if (applicabilityEvidence !== undefined
    && (applicabilityEvidence.buildSha256 !== observedBuild.buildSha256
      || applicabilityEvidence.sourceSkillSha256 !== observedBuild.sourceSkillSha256
      || applicabilityEvidence.testedUrl !== url)) {
    fail('typography applicability does not bind the exact tested URL, build, and source skill');
  }
  validateSourceSealArtifact(parseJson(backed(root, sourceSeal, 'source seal'), 'source seal'));
  const sealFindings = validateSourceSeal(root, invocation, continuationRoute);
  if (sealFindings.length !== 0) fail(`source seal is stale: ${sealFindings.map((finding) => finding.path).join(', ')}`);
  validateObservationSet(root, observationReceipts, url, state, testedViewports, observedBuild.buildSha256);
  return Object.freeze({
    schema: legacy ? LEGACY_COMPLETENESS_RUN_SCHEMA : workflow ? WORKFLOW_COMPLETENESS_RUN_SCHEMA : COMPLETENESS_RUN_SCHEMA,
    requirements,
    buildIdentity,
    sourceSeal,
    ...(typographyApplicability === undefined ? {} : { typographyApplicability }),
    testedUrl: url,
    testedState: state,
    viewports: testedViewports,
    observations: observationReceipts,
    findings: Object.freeze([] as const),
    build: observedBuild,
  });
}
function normalizeInput(root: string, input: unknown, invocation: ProjectRunInvocation): CompletenessRun {
  const item = object(input, 'run input');
  exact(item, ['schema', 'requirements', 'buildIdentity', 'sourceSeal', 'typographyApplicability', 'testedUrl', 'testedState', 'viewports', 'observations', 'findings'], 'run input');
  if (item.schema !== COMPLETENESS_RUN_INPUT_SCHEMA && item.schema !== WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA) fail('run input schema is invalid');
  const runSchema = item.schema === WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA ? WORKFLOW_COMPLETENESS_RUN_SCHEMA : COMPLETENESS_RUN_SCHEMA;
  if (values(item.findings, 'run input findings').length !== 0) fail('a completeness run requires zero findings');
  const buildIdentity = receipt(item.buildIdentity, 'buildIdentity', ['omd-build-identity-v1']);
  const observedBuild = build(parseJson(backed(root, buildIdentity, 'build identity'), 'build identity'));
  return validateRun(root, { ...item, schema: runSchema, buildIdentity, build: observedBuild }, invocation, true);
}
function pointer(value: unknown): CompletenessCurrentPointer {
  const item = object(value, 'current pointer'); exact(item, ['schema', 'record', 'sha256'], 'current pointer');
  if (item.schema !== COMPLETENESS_CURRENT_SCHEMA) fail('current pointer schema is invalid');
  const record = safePath(item.record, 'current pointer record'); const digestValue = digest(item.sha256, 'current pointer sha256');
  const match = RUN_RECORD.exec(record);
  if (match === null || match[1] !== digestValue) fail('current pointer does not bind its content-addressed record');
  return Object.freeze({ schema: COMPLETENESS_CURRENT_SCHEMA, record, sha256: digestValue });
}

/** Publishes only a fully backed, zero-finding immutable run, then advances its guarded pointer. */
export function publishCompletenessRun(root: string, input: unknown, invocation: ProjectRunInvocation): string {
  const preflight = normalizeInput(root, input, invocation);
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const run = normalizeInput(root, input, invocation);
    if (canonicalJson(run) !== canonicalJson(preflight)) fail('evidence changed between preflight and publication lock');
    const bytes = `${canonicalJson(run)}\n`; const digestValue = hash(bytes);
    const record = `.omd/completeness-runs/sha256-${digestValue}.json`;
    writeContentAddressedProjectFile({ projectRoot: root, relativePath: record, content: bytes, invocation });
    replaceProjectFileAtomically({ projectRoot: root, relativePath: '.omd/completeness-current.json', content: `${canonicalJson({ schema: COMPLETENESS_CURRENT_SCHEMA, record: record.slice('.omd/'.length), sha256: digestValue })}\n`, invocation });
    return resolve(root, record);
  } finally { release(); }
}

/** Read-only current-pointer check. Historical/orphan runs are deliberately ignored. */
export function checkCompletenessRun(
  root: string,
  invocation: ProjectRunInvocation,
  continuationRoute?: AdaptiveSourceSealRoute,
): CompletenessRun {
  const current = pointer(parseJson(stableRead(root, '.omd/completeness-current.json', 'completeness current pointer'), 'completeness current pointer'));
  const bytes = stableRead(root, `.omd/${current.record}`, 'completeness current run');
  if (hash(bytes) !== current.sha256) fail('current pointer hash does not match the immutable run');
  return validateRun(root, parseJson(bytes, 'completeness current run'), invocation, false, continuationRoute);
}
