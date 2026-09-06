import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { validateDecisionGraph, type DecisionGraph } from '../deliberation/contracts.ts';
import {
  fields,
  oneOf,
  receipt,
  safePath,
  schema,
  text,
  token,
  uniqueTokens,
  values,
  type ArtifactReceipt,
} from './proof-primitives.ts';

export const DECISION_PRINCIPLE_BINDINGS_SCHEMA = 'decision-principle-bindings-v1' as const;

export type DecisionPrincipleBindingErrorCode =
  | 'DECISION_PRINCIPLE_MALFORMED'
  | 'DECISION_PRINCIPLE_STALE_GRAPH'
  | 'DECISION_PRINCIPLE_STALE_REFERENCE'
  | 'DECISION_PRINCIPLE_DUPLICATE'
  | 'DECISION_PRINCIPLE_UNKNOWN_DECISION'
  | 'DECISION_PRINCIPLE_UNSELECTED_DECISION'
  | 'DECISION_PRINCIPLE_INCONSEQUENTIAL'
  | 'DECISION_PRINCIPLE_UNUSED'
  | 'DECISION_PRINCIPLE_AESTHETIC_COPY';

export class DecisionPrincipleBindingError extends Error {
  override readonly name = 'DecisionPrincipleBindingError';
  readonly code: DecisionPrincipleBindingErrorCode;

  constructor(code: DecisionPrincipleBindingErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

export type DecisionPrincipleArtifactSnapshot<S extends string = string> = Readonly<{
  path: string;
  schema: S;
  bytes: Uint8Array;
}>;
export type CurrentReferencePrinciple = Readonly<{
  id: string;
  statement: string;
  artifact: DecisionPrincipleArtifactSnapshot;
  locator: string;
}>;
export type DecisionPrincipleBindingsCurrent = Readonly<{
  decisionGraph: DecisionPrincipleArtifactSnapshot<'decision-graph-v1'>;
  referenceSelection?: DecisionPrincipleArtifactSnapshot<'reference-selection-v2'>;
  referencePrinciples: readonly CurrentReferencePrinciple[];
}>;
export type PrincipleSource = Readonly<{
  kind: 'reference' | 'task' | 'user' | 'theory';
  artifact: ArtifactReceipt;
  locator: string;
}>;
export type BoundPrinciple = Readonly<{
  id: string;
  statement: string;
  source: PrincipleSource;
  classification: 'transferable-principle' | 'source-aesthetic';
  disposition: 'used' | 'rejected' | 'quarantined';
  dispositionReason: string;
}>;
export type PrincipleApplication = Readonly<{
  target: string;
  destinationChange: string;
  observableResult: string;
}>;
export type DecisionPrincipleBinding = Readonly<{
  decisionId: string;
  alternativeId: string;
  principleId: string;
  disposition: 'adopt' | 'adapt' | 'reject';
  application: PrincipleApplication;
  evidenceIds: readonly string[];
}>;
export type DecisionPrincipleBindings = Readonly<{
  schema: typeof DECISION_PRINCIPLE_BINDINGS_SCHEMA;
  decisionGraph: ArtifactReceipt<'decision-graph-v1'>;
  referenceSelection: ArtifactReceipt<'reference-selection-v2'> | null;
  principles: readonly BoundPrinciple[];
  bindings: readonly DecisionPrincipleBinding[];
}>;

const fail = (code: DecisionPrincipleBindingErrorCode, message?: string): never => {
  throw new DecisionPrincipleBindingError(code, message);
};
const malformed = (message: string): never => fail('DECISION_PRINCIPLE_MALFORMED', message);
const sameReceipt = (left: ArtifactReceipt, right: ArtifactReceipt): boolean => (
  left.path === right.path && left.schema === right.schema && left.sha256 === right.sha256
);
const snapshotReceipt = <S extends string>(value: DecisionPrincipleArtifactSnapshot<S>): ArtifactReceipt<S> => Object.freeze({
  path: safePath(value.path, 'current artifact path', malformed),
  schema: schema(value.schema, 'current artifact schema', malformed) as S,
  sha256: sha256(value.bytes),
});
const parseCurrentGraph = (current: DecisionPrincipleBindingsCurrent): { graph: DecisionGraph; receipt: ArtifactReceipt<'decision-graph-v1'> } => {
  const expected = snapshotReceipt(current.decisionGraph);
  if (expected.schema !== 'decision-graph-v1') return fail('DECISION_PRINCIPLE_STALE_GRAPH');
  let input: unknown;
  try { input = JSON.parse(Buffer.from(current.decisionGraph.bytes).toString('utf8')); } catch {
    return fail('DECISION_PRINCIPLE_STALE_GRAPH', 'current decision graph is not JSON');
  }
  const checked = validateDecisionGraph(input);
  const graph = checked.value;
  if (graph === undefined) return fail('DECISION_PRINCIPLE_STALE_GRAPH', 'current decision graph is invalid');
  return { graph, receipt: expected };
};
const parseSource = (value: unknown, label: string): PrincipleSource => {
  const item = fields(value, ['kind', 'artifact', 'locator'], label, malformed);
  return Object.freeze({
    kind: oneOf(item.get('kind'), ['reference', 'task', 'user', 'theory'], `${label}.kind`, malformed),
    artifact: receipt(item.get('artifact'), `${label}.artifact`, malformed),
    locator: text(item.get('locator'), `${label}.locator`, malformed),
  });
};
const parsePrinciple = (value: unknown, index: number): BoundPrinciple => {
  const label = `principles[${index}]`;
  const item = fields(value, ['id', 'statement', 'source', 'classification', 'disposition', 'dispositionReason'], label, malformed);
  return Object.freeze({
    id: token(item.get('id'), `${label}.id`, malformed),
    statement: text(item.get('statement'), `${label}.statement`, malformed),
    source: parseSource(item.get('source'), `${label}.source`),
    classification: oneOf(item.get('classification'), ['transferable-principle', 'source-aesthetic'], `${label}.classification`, malformed),
    disposition: oneOf(item.get('disposition'), ['used', 'rejected', 'quarantined'], `${label}.disposition`, malformed),
    dispositionReason: text(item.get('dispositionReason'), `${label}.dispositionReason`, malformed),
  });
};
const parseApplication = (value: unknown, label: string): PrincipleApplication => {
  const item = fields(value, ['target', 'destinationChange', 'observableResult'], label, malformed);
  return Object.freeze({
    target: token(item.get('target'), `${label}.target`, malformed),
    destinationChange: text(item.get('destinationChange'), `${label}.destinationChange`, malformed),
    observableResult: text(item.get('observableResult'), `${label}.observableResult`, malformed),
  });
};
const parseBinding = (value: unknown, index: number): DecisionPrincipleBinding => {
  const label = `bindings[${index}]`;
  const item = fields(value, ['decisionId', 'alternativeId', 'principleId', 'disposition', 'application', 'evidenceIds'], label, malformed);
  return Object.freeze({
    decisionId: token(item.get('decisionId'), `${label}.decisionId`, malformed),
    alternativeId: token(item.get('alternativeId'), `${label}.alternativeId`, malformed),
    principleId: token(item.get('principleId'), `${label}.principleId`, malformed),
    disposition: oneOf(item.get('disposition'), ['adopt', 'adapt', 'reject'], `${label}.disposition`, malformed),
    application: parseApplication(item.get('application'), `${label}.application`),
    evidenceIds: uniqueTokens(item.get('evidenceIds'), `${label}.evidenceIds`, malformed, false),
  });
};
const AESTHETIC_COPY = /(?:\b(?:copy|clone|imitate|match|reproduce|trace)\b.{0,48}\b(?:source|reference|aesthetic|style|look)\b|\blooks?\s+like\b|\bexact\s+(?:geometry|layout|type|typography|palette|radii?|silhouette)\b|\b(?:source\s+)?(?:palette|font\s+family|branded\s+(?:interaction|silhouette))\b)/i;

function validateReferencePrinciple(
  principle: BoundPrinciple,
  current: DecisionPrincipleBindingsCurrent,
): void {
  if (principle.source.kind !== 'reference') return;
  const expected = current.referencePrinciples.find((item) => item.id === principle.id);
  if (expected === undefined
    || expected.statement !== principle.statement
    || expected.locator !== principle.source.locator
    || !sameReceipt(principle.source.artifact, snapshotReceipt(expected.artifact))) {
    fail('DECISION_PRINCIPLE_STALE_REFERENCE', `reference principle ${principle.id} is not current`);
  }
}

export function parseDecisionPrincipleBindings(
  value: unknown,
  current: DecisionPrincipleBindingsCurrent,
): DecisionPrincipleBindings {
  try {
    const root = fields(value, ['schema', 'decisionGraph', 'referenceSelection', 'principles', 'bindings'], 'decision principle bindings', malformed);
    if (root.get('schema') !== DECISION_PRINCIPLE_BINDINGS_SCHEMA) malformed('decision principle binding schema is invalid');
    const graph = parseCurrentGraph(current);
    const decisionGraph = receipt(root.get('decisionGraph'), 'decisionGraph', malformed);
    if (decisionGraph.schema !== 'decision-graph-v1' || !sameReceipt(decisionGraph, graph.receipt)) {
      fail('DECISION_PRINCIPLE_STALE_GRAPH');
    }
    const rawSelection = root.get('referenceSelection');
    const referenceSelection = rawSelection === null ? null : receipt(rawSelection, 'referenceSelection', malformed);
    if (referenceSelection !== null && referenceSelection.schema !== 'reference-selection-v2') malformed('reference selection schema is invalid');
    const expectedSelection = current.referenceSelection === undefined ? undefined : snapshotReceipt(current.referenceSelection);
    if (referenceSelection !== null && (expectedSelection === undefined || !sameReceipt(referenceSelection, expectedSelection))) {
      fail('DECISION_PRINCIPLE_STALE_REFERENCE');
    }
    const principles = Object.freeze(values(root.get('principles'), 'principles', malformed).map(parsePrinciple));
    const bindings = Object.freeze(values(root.get('bindings'), 'bindings', malformed).map(parseBinding));
    if (new Set(principles.map((item) => item.id)).size !== principles.length) fail('DECISION_PRINCIPLE_DUPLICATE');
    const bindingKeys = bindings.map((item) => `${item.decisionId}\u0000${item.principleId}\u0000${item.disposition}`);
    if (new Set(bindingKeys).size !== bindingKeys.length) fail('DECISION_PRINCIPLE_DUPLICATE');

    for (const principle of principles) {
      validateReferencePrinciple(principle, current);
      if (principle.source.kind === 'reference' && referenceSelection === null) fail('DECISION_PRINCIPLE_STALE_REFERENCE');
      if (principle.classification === 'source-aesthetic' && principle.disposition === 'used') {
        fail('DECISION_PRINCIPLE_AESTHETIC_COPY');
      }
      if (principle.disposition === 'used' && AESTHETIC_COPY.test(principle.statement)) {
        fail('DECISION_PRINCIPLE_AESTHETIC_COPY');
      }
    }

    const principleById = new Map(principles.map((item) => [item.id, item]));
    const decisionById = new Map(graph.graph.decisions.map((item) => [item.id, item]));
    for (const binding of bindings) {
      const principle = principleById.get(binding.principleId)
        ?? fail('DECISION_PRINCIPLE_UNUSED', `binding references unknown principle ${binding.principleId}`);
      if (principle.disposition !== 'used') fail('DECISION_PRINCIPLE_INCONSEQUENTIAL', 'rejected or quarantined principles cannot drive decisions');
      const decision = decisionById.get(binding.decisionId) ?? fail('DECISION_PRINCIPLE_UNKNOWN_DECISION');
      if (!decision.alternatives.some((item) => item.id === binding.alternativeId)) fail('DECISION_PRINCIPLE_UNKNOWN_DECISION');
      if (binding.disposition !== 'reject' && decision.selected !== binding.alternativeId) fail('DECISION_PRINCIPLE_UNSELECTED_DECISION');
      if (!decision.affects.includes(binding.application.target)
        || binding.evidenceIds.some((id) => !decision.evidence.includes(id))) {
        fail('DECISION_PRINCIPLE_INCONSEQUENTIAL');
      }
    }
    for (const principle of principles) {
      if (principle.disposition === 'used'
        && !bindings.some((binding) => binding.principleId === principle.id && binding.disposition !== 'reject')) {
        fail('DECISION_PRINCIPLE_UNUSED');
      }
    }
    return Object.freeze({
      schema: DECISION_PRINCIPLE_BINDINGS_SCHEMA,
      decisionGraph: decisionGraph as ArtifactReceipt<'decision-graph-v1'>,
      referenceSelection: referenceSelection as ArtifactReceipt<'reference-selection-v2'> | null,
      principles,
      bindings,
    });
  } catch (error) {
    if (error instanceof DecisionPrincipleBindingError) throw error;
    return fail('DECISION_PRINCIPLE_MALFORMED', 'decision principle binding input could not be inspected safely');
  }
}

export function decisionPrincipleBindingsSha256(value: DecisionPrincipleBindings): string {
  return sha256(canonicalJson(value));
}
