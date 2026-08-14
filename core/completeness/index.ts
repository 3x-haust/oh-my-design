// Functional completeness.
//
// The loop measures craft, hierarchy, and slop, but nothing correlated the brief's stated
// requirements with the built page: a landing that looks right and never links to the repository
// still passes every visual gate. This module is that correlation and nothing else — it reuses the
// IR every other check already extracts, and adds no new style rule.

import type { RawNode } from '../types.ts';

export const FUNCTIONAL_REQUIREMENTS_SCHEMA = 'functional-requirements-v1' as const;
export const FUNCTIONAL_REQUIREMENTS_V2_SCHEMA = 'functional-requirements-v2' as const;
export const REQUIREMENT_KINDS = ['action', 'preference', 'form', 'content'] as const;

export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export type FunctionalRequirement = {
  readonly id: string;
  readonly kind: RequirementKind;
  /** What the visitor must be able to do, in the brief's words. */
  readonly statement: string;
  /** Visible text that proves the affordance exists on the page. */
  readonly label: string;
};

export type FunctionalRequirements = {
  readonly schema: typeof FUNCTIONAL_REQUIREMENTS_SCHEMA;
  readonly requirements: readonly FunctionalRequirement[];
};

export type FunctionalEvidenceViewport = Readonly<{ width: number; height: number }>;
export type FunctionalRequirementsV2 = {
  readonly schema: typeof FUNCTIONAL_REQUIREMENTS_V2_SCHEMA;
  readonly requirements: readonly FunctionalRequirement[];
  readonly evidence: Readonly<{
    readonly states: readonly string[];
    readonly viewports: readonly FunctionalEvidenceViewport[];
  }>;
};
export type FunctionalRequirementsDocument = FunctionalRequirements | FunctionalRequirementsV2;

export type CompletenessFinding = {
  readonly id: string;
  readonly requirement: string;
  readonly message: string;
};

const REQUIREMENT_KEYS = ['id', 'kind', 'statement', 'label'] as const;

class FunctionalRequirementsValidationError extends Error {}
function functionalRequirementsFailure(message: string): never {
  throw new FunctionalRequirementsValidationError(`FUNCTIONAL_REQUIREMENTS_INVALID: ${message}`);
}
function dataRecord(value: unknown, label: string): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) functionalRequirementsFailure(`${label} must be an object`);
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) functionalRequirementsFailure(`${label} must not inherit input properties`);
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')) functionalRequirementsFailure(`${label} must not contain Symbol keys`);
  const result = new Map<string, unknown>();
  for (const key of own) {
    if (typeof key !== 'string') functionalRequirementsFailure(`${label} must not contain Symbol keys`);
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      functionalRequirementsFailure(`${label} must contain enumerable own data properties only`);
    }
    result.set(key, descriptor.value);
  }
  return result;
}
function exactFields(value: ReadonlyMap<string, unknown>, keys: readonly string[], label: string): void {
  if (value.size !== keys.length || keys.some((key) => !value.has(key))) functionalRequirementsFailure(`${label} has unknown or missing keys`);
}
function dataArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) functionalRequirementsFailure(`${label} must be an array`);
  const own = Reflect.ownKeys(value);
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  if (own.length !== expected.length + 1 || own.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) {
    functionalRequirementsFailure(`${label} must be dense and undecorated`);
  }
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor) || lengthDescriptor.enumerable) {
    functionalRequirementsFailure(`${label} must be dense and undecorated`);
  }
  return expected.map((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) functionalRequirementsFailure(`${label} must contain data entries only`);
    return descriptor.value;
  });
}

function parseRequirementEntries(value: unknown): readonly FunctionalRequirement[] {
  const entries = dataArray(value, 'requirements');
  if (entries.length === 0) functionalRequirementsFailure('at least one requirement is required');
  const seen = new Set<string>();
  return Object.freeze(entries.map((entry) => {
    const item = dataRecord(entry, 'each requirement');
    exactFields(item, REQUIREMENT_KEYS, `each requirement must contain exactly ${REQUIREMENT_KEYS.join(', ')}`);
    const id = item.get('id');
    if (typeof id !== 'string' || !/^R-\d+$/.test(id)) functionalRequirementsFailure('requirement id must be R-<number>');
    if (seen.has(id)) functionalRequirementsFailure(`duplicate requirement ${id}`);
    seen.add(id);
    const kind = item.get('kind');
    if (!(REQUIREMENT_KINDS as readonly unknown[]).includes(kind)) functionalRequirementsFailure(`requirement ${id} kind must be one of ${REQUIREMENT_KINDS.join(', ')}`);
    const statement = item.get('statement'); const label = item.get('label');
    if (typeof statement !== 'string' || statement.trim() === '') functionalRequirementsFailure(`requirement ${id} needs a non-empty statement`);
    if (typeof label !== 'string' || label.trim() === '') functionalRequirementsFailure(`requirement ${id} needs a non-empty label`);
    return Object.freeze({ id, kind: kind as RequirementKind, statement, label });
  }));
}

function parseEvidence(value: unknown): FunctionalRequirementsV2['evidence'] {
  const evidence = dataRecord(value, 'evidence');
  exactFields(evidence, ['states', 'viewports'], 'evidence');
  const stateValues = dataArray(evidence.get('states'), 'evidence states');
  if (stateValues.length === 0) functionalRequirementsFailure('at least one evidence state is required');
  const states = stateValues.map((state) => typeof state === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state)
    ? state : functionalRequirementsFailure('evidence states must be normalized state identifiers'));
  if (new Set(states).size !== states.length) functionalRequirementsFailure('evidence states must be unique');
  const viewportValues = dataArray(evidence.get('viewports'), 'evidence viewports');
  if (viewportValues.length === 0) functionalRequirementsFailure('at least one evidence viewport is required');
  const viewports = viewportValues.map((value, index) => {
    const viewport = dataRecord(value, `evidence viewport ${index}`);
    exactFields(viewport, ['width', 'height'], `evidence viewport ${index}`);
    const width = viewport.get('width'); const height = viewport.get('height');
    if (typeof width !== 'number' || !Number.isSafeInteger(width) || width < 1 || width > 16384
      || typeof height !== 'number' || !Number.isSafeInteger(height) || height < 1 || height > 16384) {
      functionalRequirementsFailure(`evidence viewport ${index} must contain bounded integer width and height`);
    }
    return Object.freeze({ width, height });
  });
  if (new Set(viewports.map(({ width, height }) => `${width}x${height}`)).size !== viewports.length) functionalRequirementsFailure('evidence viewports must be unique');
  return Object.freeze({ states: Object.freeze(states), viewports: Object.freeze(viewports) });
}

/** Reads persisted v1 exactly as v1 and the additive v2 contract under its own schema name. */
export function parseFunctionalRequirements(value: unknown): FunctionalRequirementsDocument {
  try {
    const record = dataRecord(value, 'requirements');
    const schema = record.get('schema');
    if (schema === FUNCTIONAL_REQUIREMENTS_SCHEMA) {
      if (record.size !== 2 || !record.has('schema') || !record.has('requirements')) functionalRequirementsFailure('requirements must contain exactly requirements, schema');
      return Object.freeze({ schema: FUNCTIONAL_REQUIREMENTS_SCHEMA, requirements: parseRequirementEntries(record.get('requirements')) });
    }
    if (schema === FUNCTIONAL_REQUIREMENTS_V2_SCHEMA) {
      if (record.size !== 3 || !record.has('schema') || !record.has('requirements') || !record.has('evidence')) functionalRequirementsFailure('requirements must contain exactly evidence, requirements, schema');
      return Object.freeze({ schema: FUNCTIONAL_REQUIREMENTS_V2_SCHEMA, requirements: parseRequirementEntries(record.get('requirements')), evidence: parseEvidence(record.get('evidence')) });
    }
    return functionalRequirementsFailure(`schema must be ${FUNCTIONAL_REQUIREMENTS_SCHEMA} or ${FUNCTIONAL_REQUIREMENTS_V2_SCHEMA}`);
  } catch (error) {
    if (error instanceof FunctionalRequirementsValidationError) throw error;
    return functionalRequirementsFailure('requirements could not be inspected safely');
  }
}

export function validateFunctionalRequirements(value: unknown): FunctionalRequirementsDocument {
  return parseFunctionalRequirements(value);
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

function matches(node: RawNode, label: string): boolean {
  const text = normalize(node.text ?? '');
  if (text === '') return false;
  const wanted = normalize(label);
  return text === wanted || text.includes(wanted);
}

function descendants(nodes: readonly RawNode[], root: RawNode): readonly RawNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const out: RawNode[] = [];
  const seen = new Set<string>();
  const queue = [...root.children];
  while (queue.length > 0) {
    const node = byId.get(queue.shift()!);
    if (node === undefined || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
    queue.push(...node.children);
  }
  return out;
}

function ancestors(nodes: readonly RawNode[], node: RawNode): readonly RawNode[] {
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const out: RawNode[] = [];
  const seen = new Set<string>();
  let current = node.parent === null ? undefined : byId.get(node.parent);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    out.push(current);
    current = current.parent === null ? undefined : byId.get(current.parent);
  }
  return out;
}

/**
 * A requirement is satisfied when its affordance exists, is operable, and is reachable by keyboard.
 * `action` and `preference` need an interactive, focusable carrier; `form` needs a labelled field
 * inside a control group; `content` only needs to be present and legible to a reader.
 */
export function checkFunctionalCompleteness(
  requirements: FunctionalRequirementsDocument,
  nodes: readonly RawNode[],
): readonly CompletenessFinding[] {
  const findings: CompletenessFinding[] = [];
  for (const requirement of requirements.requirements) {
    const carriers = nodes.filter((node) => matches(node, requirement.label));
    if (carriers.length === 0) {
      findings.push({ id: 'FUNC-MISSING', requirement: requirement.id, message: `${requirement.statement} — no element carries the text "${requirement.label}".` });
      continue;
    }
    if (requirement.kind === 'content') continue;

    if (requirement.kind === 'form') {
      const fielded = carriers.some((carrier) => {
        const group = [...descendants(nodes, carrier), ...ancestors(nodes, carrier).flatMap((parent) => descendants(nodes, parent))];
        return group.some((node) => node.interactive === true);
      });
      if (!fielded) findings.push({ id: 'FUNC-FORM-INERT', requirement: requirement.id, message: `${requirement.statement} — "${requirement.label}" labels no interactive field.` });
      continue;
    }

    const operable = carriers.filter((carrier) => carrier.interactive === true || descendants(nodes, carrier).some((node) => node.interactive === true) || ancestors(nodes, carrier).some((node) => node.interactive === true));
    if (operable.length === 0) {
      findings.push({ id: 'FUNC-INERT', requirement: requirement.id, message: `${requirement.statement} — "${requirement.label}" is text, not an operable control.` });
      continue;
    }
    const reachable = operable.some((carrier) => [carrier, ...ancestors(nodes, carrier)].some((node) => node.focusable === true));
    if (!reachable) {
      findings.push({ id: 'FUNC-UNREACHABLE', requirement: requirement.id, message: `${requirement.statement} — "${requirement.label}" is not reachable by keyboard.` });
    }
  }
  return findings;
}
