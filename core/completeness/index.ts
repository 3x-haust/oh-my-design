// Functional completeness.
//
// The loop measures craft, hierarchy, and slop, but nothing correlated the brief's stated
// requirements with the built page: a landing that looks right and never links to the repository
// still passes every visual gate. This module is that correlation and nothing else — it reuses the
// IR every other check already extracts, and adds no new style rule.

import type { RawNode } from '../types.ts';

export const FUNCTIONAL_REQUIREMENTS_SCHEMA = 'functional-requirements-v1' as const;
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

export type CompletenessFinding = {
  readonly id: string;
  readonly requirement: string;
  readonly message: string;
};

const REQUIREMENT_KEYS = ['id', 'kind', 'statement', 'label'] as const;

export function validateFunctionalRequirements(value: unknown): FunctionalRequirements {
  const fail = (message: string): never => { throw new Error(`FUNCTIONAL_REQUIREMENTS_INVALID: ${message}`); };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('requirements must be an object with schema and requirements');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'requirements,schema') return fail('requirements must contain exactly schema, requirements');
  if (record.schema !== FUNCTIONAL_REQUIREMENTS_SCHEMA) return fail(`schema must be ${FUNCTIONAL_REQUIREMENTS_SCHEMA}`);
  if (!Array.isArray(record.requirements) || record.requirements.length === 0) return fail('at least one requirement is required');
  const seen = new Set<string>();
  const requirements = record.requirements.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return fail('each requirement must be an object');
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).sort().join(',') !== [...REQUIREMENT_KEYS].sort().join(',')) return fail(`each requirement must contain exactly ${REQUIREMENT_KEYS.join(', ')}`);
    if (typeof item.id !== 'string' || !/^R-\d+$/.test(item.id)) return fail('requirement id must be R-<number>');
    if (seen.has(item.id)) return fail(`duplicate requirement ${item.id}`);
    seen.add(item.id);
    if (!(REQUIREMENT_KINDS as readonly unknown[]).includes(item.kind)) return fail(`requirement ${item.id} kind must be one of ${REQUIREMENT_KINDS.join(', ')}`);
    for (const key of ['statement', 'label'] as const) {
      if (typeof item[key] !== 'string' || (item[key] as string).trim() === '') return fail(`requirement ${item.id} needs a non-empty ${key}`);
    }
    return { id: item.id, kind: item.kind as RequirementKind, statement: item.statement as string, label: item.label as string };
  });
  return { schema: FUNCTIONAL_REQUIREMENTS_SCHEMA, requirements: Object.freeze(requirements) };
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
  const queue = [...root.children];
  while (queue.length > 0) {
    const node = byId.get(queue.shift()!);
    if (node === undefined) continue;
    out.push(node);
    queue.push(...node.children);
  }
  return out;
}

function ancestors(nodes: readonly RawNode[], node: RawNode): readonly RawNode[] {
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const out: RawNode[] = [];
  let current = node.parent === null ? undefined : byId.get(node.parent);
  while (current !== undefined) {
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
  requirements: FunctionalRequirements,
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
