import * as v from './validation.ts';
import type { RGBA, ViewRequest } from './types.ts';
import { parseViewState } from '../render/stateful.ts';

export type TypeRole = { id: string; familyId: string; size: number | { breakpoints: { width: number; size: number }[] }; weights: number[]; leading: number | 'normal'; minimumReadablePx: number; required: boolean };
export type TypeContract = { schema: 'type-proof-contract-v1'; families: { id: string; stack: string[] }[]; roles: TypeRole[]; assignments: { selector: string; role: string }[]; defaultTextRole: string; requiredViews: ViewRequest[] };
export type CompositionContract = {
  schema: 'composition-measurement-contract-v1';
  frequentAction: string | null;
  regions: { selector: string; role: 'task' | 'utility' | 'status' | 'evidence'; minimumVisible: number }[];
  colors: { role: string; selector: string; property: 'background' | 'text'; value: string; token: string | null }[];
  spacing: { scale: number[]; tolerance: number; opticalExceptions: { selector: string; property: string; value: number }[] } | null;
  relationships: { before: string; after: string }[]; requiredViews: ViewRequest[];
};
export type Contracts = { type: TypeContract | null; composition: CompositionContract | null; tokens: ReturnType<typeof import('../tokens/contract.ts').validateTokenCommit> | null; errors: string[];
  routeSkipped?: { type?: string; composition?: string }; selectedAssignments?: Record<string, string> };
const positive: v.Validator = n => { v.number(n); if ((n as number) <= 0) v.fail('expected positive number'); };
const view: v.Validator = input => v.object({ id: v.text, viewport: v.object({ width: positive, height: positive }), browserZoom: v.enumeration(1, 2),
  ...(input && typeof input === 'object' && Object.hasOwn(input, 'state') ? { state: value => { parseViewState(value); } } : {}) })(input);
const size: v.Validator = n => {
  if (typeof n === 'number') return positive(n);
  v.object({ breakpoints: v.array(v.object({ width: positive, size: positive })) })(n);
  const points = (n as { breakpoints: { width: number; size: number }[] }).breakpoints;
  if (points.length < 2 || points.length > 8 || points.some((p, i) => i > 0 && p.width <= points[i - 1]!.width)) v.fail('responsive size needs 2-8 increasing tested breakpoints');
  if (Math.max(...points.map(p => p.size)) / Math.min(...points.map(p => p.size)) > 2) v.fail('responsive size range is not bounded to a tested treatment');
};
export function parseTypeContract(input: unknown): TypeContract {
  v.object({ schema: v.enumeration('type-proof-contract-v1'), families: v.array(v.object({ id: v.text, stack: v.array(v.text) })), roles: v.array(v.object({ id: v.text, familyId: v.text, size, weights: v.array(positive), leading: n => n === 'normal' ? undefined : positive(n), minimumReadablePx: positive, required: v.boolean })), assignments: v.array(v.object({ selector: v.text, role: v.text })), defaultTextRole: v.text, requiredViews: v.array(view) })(input);
  const c = input as TypeContract;
  v.unique(c.families.map(f => f.id), 'family'); v.unique(c.roles.map(r => r.id), 'role'); v.unique(c.assignments.map(a => a.selector), 'assignment'); v.unique(c.requiredViews.map(w => w.id), 'view');
  if (!c.roles.length || !c.families.length || c.families.some(f => !f.stack.length) || !c.roles.some(r => r.id === c.defaultTextRole)) v.fail('incomplete type contract');
  for (const role of c.roles) if (!c.families.some(f => f.id === role.familyId) || !role.weights.length || role.weights.some(w => w < 1 || w > 1000)) v.fail('invalid role family/weights');
  if (c.assignments.some(a => !c.roles.some(r => r.id === a.role))) v.fail('assignment names unknown role');
  return c;
}
export function parseCompositionContract(input: unknown): CompositionContract {
  v.object({ schema: v.enumeration('composition-measurement-contract-v1'), frequentAction: v.nullable(v.text), regions: v.array(v.object({ selector: v.text, role: v.enumeration('task', 'utility', 'status', 'evidence'), minimumVisible: v.integer })), colors: v.array(v.object({ role: v.text, selector: v.text, property: v.enumeration('background', 'text'), value: v.pattern(/^#[0-9a-fA-F]{6}$/), token: v.nullable(v.pattern(/^--[a-zA-Z0-9_-]+$/)) })), spacing: v.nullable(v.object({ scale: v.array(v.nonnegative), tolerance: v.nonnegative, opticalExceptions: v.array(v.object({ selector: v.text, property: v.text, value: v.nonnegative })) })), relationships: v.array(v.object({ before: v.text, after: v.text })), requiredViews: v.array(view) })(input);
  const c = input as CompositionContract;
  v.unique(c.colors.map(r => `${r.selector}:${r.property}`), 'color assignment'); v.unique(c.regions.map(r => r.selector), 'region');
  if (c.spacing && (!c.spacing.scale.length || c.spacing.tolerance > 0.5)) v.fail('spacing needs a committed scale and tolerance <=0.5px');
  if (!c.colors.some(r => r.role === 'canvas')) v.fail('composition needs an explicit canvas color');
  return c;
}
export function measurementBlock(markdown: string): unknown {
  const sections = [...markdown.matchAll(/^## Measurement contract\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  if (sections.length !== 1) v.fail('CONTRACT_UNMEASURABLE: exactly one Measurement contract section required');
  const fences = [...sections[0]![1]!.matchAll(/^```json\s*\n([\s\S]*?)^```\s*$/gm)];
  if (fences.length !== 1) v.fail('CONTRACT_UNMEASURABLE: exactly one JSON fence required');
  try { return JSON.parse(fences[0]![1]!); } catch { return v.fail('CONTRACT_UNMEASURABLE: malformed JSON'); }
}
export function selectors(contracts: Contracts): string[] {
  return [...new Set([...(contracts.type?.assignments.map(a => a.selector) ?? []), ...(contracts.composition?.colors.map(a => a.selector) ?? []), ...(contracts.composition?.regions.map(a => a.selector) ?? []), ...(contracts.composition?.spacing?.opticalExceptions.map(a => a.selector) ?? []), ...(contracts.composition?.relationships.flatMap(a => [a.before, a.after]) ?? [])])];
}
export function roleSize(role: TypeRole, width: number): number {
  if (typeof role.size === 'number') return role.size;
  const points = role.size.breakpoints;
  if (width <= points[0]!.width) return points[0]!.size;
  for (let i = 1; i < points.length; i++) { const a = points[i - 1]!, b = points[i]!; if (width <= b.width) return a.size + (b.size - a.size) * (width - a.width) / (b.width - a.width); }
  return points.at(-1)!.size;
}
export function hexColor(hex: string): RGBA { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 1]; }
