import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { canonicalJson } from '../core/ref/board-artifacts.ts';
import {
  DECISION_PRINCIPLE_BINDINGS_SCHEMA,
  DecisionPrincipleBindingError,
  decisionPrincipleBindingsSha256,
  parseDecisionPrincipleBindings,
  type DecisionPrincipleBindingErrorCode,
} from '../core/design-development/decision-principle-bindings.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const graph = () => ({
  schema: 'decision-graph-v1',
  decisions: [{
    id: 'queue-scan-path', stage: 'composition', risk: 'medium', owner: 'omd-composer',
    question: 'How should operators scan blocked orders?',
    alternatives: [{ id: 'stable-columns', label: 'Keep stable scan columns.' }, { id: 'decorative-cards', label: 'Use decorative cards.' }],
    selected: 'stable-columns',
    evidence: ['evidence:operator-scan-test'], constraints: ['Dense queues must remain scannable.'],
    rejected: [{ id: 'decorative-cards', reason: 'Variable card geometry slows comparison.' }],
    affects: ['region:order-queue'], dependsOn: [], reversible: true, tradeoffs: [],
  }],
});
const bytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const current = () => ({
  decisionGraph: { path: '.omd/decision-graph.json', schema: 'decision-graph-v1' as const, bytes: bytes(graph()) },
  referenceSelection: { path: '.omd/reference-selection-v2.json', schema: 'reference-selection-v2' as const, bytes: bytes({ selected: ['slot:queue'] }) },
  referencePrinciples: [{
    id: 'principle:stable-scan-path',
    statement: 'Keep owner, state, impact, and next action in stable scan positions.',
    artifact: { path: '.omd/reference-assembly.json', schema: 'reference-assembly-v2', bytes: bytes({ slot: 'slot:queue', principle: 'stable-scan-path' }) },
    locator: '/candidates/0/pieces/0/transfer/principles/0',
  }],
});
const receipt = (artifact: { path: string; schema: string; bytes: Uint8Array }) => ({
  path: artifact.path, schema: artifact.schema, sha256: sha(artifact.bytes),
});
const valid = () => {
  const evidence = current();
  return {
    schema: DECISION_PRINCIPLE_BINDINGS_SCHEMA,
    decisionGraph: receipt(evidence.decisionGraph),
    referenceSelection: receipt(evidence.referenceSelection),
    principles: [{
      id: 'principle:stable-scan-path',
      statement: 'Keep owner, state, impact, and next action in stable scan positions.',
      source: {
        kind: 'reference', artifact: receipt(evidence.referencePrinciples[0]!.artifact),
        locator: '/candidates/0/pieces/0/transfer/principles/0',
      },
      classification: 'transferable-principle', disposition: 'used',
      dispositionReason: 'The relational scan rule applies to the destination queue.',
    }],
    bindings: [{
      decisionId: 'queue-scan-path', alternativeId: 'stable-columns', principleId: 'principle:stable-scan-path',
      disposition: 'adapt',
      application: {
        target: 'region:order-queue',
        destinationChange: 'Align owner, state, impact, and next action into stable destination columns.',
        observableResult: 'Operators locate the blocked order and next action without opening each row.',
      },
      evidenceIds: ['evidence:operator-scan-test'],
    }],
  };
};

function throwsCode(run: () => unknown, code: DecisionPrincipleBindingErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof DecisionPrincipleBindingError);
    assert.equal(error.code, code);
    return true;
  });
}

test('bindings hash and join the exact current decision graph, reference selection, and principle evidence', () => {
  const source = valid();
  const parsed = parseDecisionPrincipleBindings(source, current());
  source.bindings[0]!.application.observableResult = 'mutated';

  assert.equal(parsed.bindings[0]?.application.observableResult, 'Operators locate the blocked order and next action without opening each row.');
  assert.match(decisionPrincipleBindingsSha256(parsed), /^[a-f0-9]{64}$/);
  assert.equal(decisionPrincipleBindingsSha256(parsed), sha(canonicalJson(parsed)));
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.bindings[0]?.application), true);
});

test('stale or substituted decision and current reference bytes fail closed', () => {
  const staleGraph = valid();
  staleGraph.decisionGraph.sha256 = sha('stale graph');
  throwsCode(() => parseDecisionPrincipleBindings(staleGraph, current()), 'DECISION_PRINCIPLE_STALE_GRAPH');

  const staleSelection = valid();
  staleSelection.referenceSelection.sha256 = sha('stale selection');
  throwsCode(() => parseDecisionPrincipleBindings(staleSelection, current()), 'DECISION_PRINCIPLE_STALE_REFERENCE');

  const stalePrinciple = valid();
  stalePrinciple.principles[0]!.source.artifact.sha256 = sha('substituted principle');
  throwsCode(() => parseDecisionPrincipleBindings(stalePrinciple, current()), 'DECISION_PRINCIPLE_STALE_REFERENCE');

  const changedStatement = valid();
  changedStatement.principles[0]!.statement = 'A caller-authored replacement principle.';
  throwsCode(() => parseDecisionPrincipleBindings(changedStatement, current()), 'DECISION_PRINCIPLE_STALE_REFERENCE');
});

test('every used reference principle resolves to the selected consequential decision and observable application', () => {
  const unbound = valid();
  unbound.bindings = [];
  throwsCode(() => parseDecisionPrincipleBindings(unbound, current()), 'DECISION_PRINCIPLE_UNUSED');

  const rejectedAlternative = valid();
  rejectedAlternative.bindings[0]!.alternativeId = 'decorative-cards';
  throwsCode(() => parseDecisionPrincipleBindings(rejectedAlternative, current()), 'DECISION_PRINCIPLE_UNSELECTED_DECISION');

  const unrelatedTarget = valid();
  unrelatedTarget.bindings[0]!.application.target = 'region:unaffected-footer';
  throwsCode(() => parseDecisionPrincipleBindings(unrelatedTarget, current()), 'DECISION_PRINCIPLE_INCONSEQUENTIAL');

  const inventedEvidence = valid();
  inventedEvidence.bindings[0]!.evidenceIds = ['evidence:not-in-decision'];
  throwsCode(() => parseDecisionPrincipleBindings(inventedEvidence, current()), 'DECISION_PRINCIPLE_INCONSEQUENTIAL');
});

test('source aesthetic copying is rejected or explicitly quarantined and cannot drive a decision', () => {
  const withCurrentStatement = (statement: string) => {
    const evidence = current();
    evidence.referencePrinciples[0]!.statement = statement;
    return evidence;
  };
  const copied = valid();
  copied.principles[0]!.classification = 'source-aesthetic';
  copied.principles[0]!.statement = 'Copy the source purple palette, font family, radii, and silhouette.';
  throwsCode(
    () => parseDecisionPrincipleBindings(copied, withCurrentStatement(copied.principles[0]!.statement)),
    'DECISION_PRINCIPLE_AESTHETIC_COPY',
  );

  const quarantined = valid();
  quarantined.principles[0]!.classification = 'source-aesthetic';
  quarantined.principles[0]!.disposition = 'quarantined';
  quarantined.principles[0]!.statement = 'Source purple palette and branded silhouette.';
  quarantined.principles[0]!.dispositionReason = 'Retained only as a fixation warning; never passed to production.';
  quarantined.bindings = [];
  const parsed = parseDecisionPrincipleBindings(quarantined, withCurrentStatement(quarantined.principles[0]!.statement));
  assert.equal(parsed.principles[0]?.disposition, 'quarantined');

  const disguised = valid();
  disguised.principles[0]!.statement = 'Make the destination look like the source with its exact font family and palette.';
  throwsCode(
    () => parseDecisionPrincipleBindings(disguised, withCurrentStatement(disguised.principles[0]!.statement)),
    'DECISION_PRINCIPLE_AESTHETIC_COPY',
  );
});

test('the binding shape is exact and hostile accessors are not invoked', () => {
  const extra = valid() as ReturnType<typeof valid> & { finalV2?: boolean };
  extra.finalV2 = true;
  throwsCode(() => parseDecisionPrincipleBindings(extra, current()), 'DECISION_PRINCIPLE_MALFORMED');

  let calls = 0;
  const accessor = valid();
  Object.defineProperty(accessor, 'bindings', { enumerable: true, get() { calls += 1; return []; } });
  throwsCode(() => parseDecisionPrincipleBindings(accessor, current()), 'DECISION_PRINCIPLE_MALFORMED');
  assert.equal(calls, 0);
});
