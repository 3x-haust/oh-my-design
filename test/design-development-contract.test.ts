import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESIGN_DEVELOPMENT_CONTRACT_SCHEMA,
  parseDesignDevelopmentContract,
} from '../core/design-development/contract.ts';

const directContract = () => ({
  schema: DESIGN_DEVELOPMENT_CONTRACT_SCHEMA,
  owner: 'user-selected-model',
  mode: 'direct',
  risks: [],
  investigations: [],
  referencePrinciples: [],
  rationale: 'The bounded copy repair has no unresolved design-development risk.',
});

test('design development remains direct when no material uncertainty needs a probe', () => {
  const parsed = parseDesignDevelopmentContract(directContract());
  assert.equal(parsed.mode, 'direct');
  assert.deepEqual(parsed.investigations, []);
  assert.deepEqual(parsed.referencePrinciples, []);
});

test('complex product work selects only investigations that retire named risks', () => {
  const parsed = parseDesignDevelopmentContract({
    schema: DESIGN_DEVELOPMENT_CONTRACT_SCHEMA,
    owner: 'user-selected-model',
    mode: 'investigate',
    risks: [
      {
        id: 'risk:dense-order-triage',
        question: 'Can operators scan blocked orders and identify the next action?',
        consequence: 'high',
        uncertainty: 'high',
        lateReversalCost: 'high',
      },
      {
        id: 'risk:shared-approval',
        question: 'Does approval communicate scope, authority, and recovery before commitment?',
        consequence: 'high',
        uncertainty: 'medium',
        lateReversalCost: 'high',
      },
    ],
    investigations: [
      {
        id: 'probe:real-content',
        kind: 'content-state-model',
        riskIds: ['risk:dense-order-triage', 'risk:shared-approval'],
        question: 'Which real objects, states, permissions, and tail-length values shape the flow?',
        fidelity: {
          content: 'production-like',
          visual: 'none',
          interaction: 'none',
          behavior: 'representative',
          environment: 'none',
        },
        stopWhen: 'The fixture covers typical, tail, empty, partial, denied, and failure states.',
      },
      {
        id: 'probe:structure',
        kind: 'structural-layout',
        riskIds: ['risk:dense-order-triage'],
        question: 'Does the scan path hold without relying on decorative colour?',
        fidelity: {
          content: 'production-like',
          visual: 'structural',
          interaction: 'none',
          behavior: 'representative',
          environment: 'responsive-browser',
        },
        stopWhen: 'Primary queue, owner, status, impact, and next action remain scannable.',
      },
      {
        id: 'probe:approval-context',
        kind: 'component-in-context',
        riskIds: ['risk:shared-approval'],
        question: 'Does the approval component preserve authority and blast radius in page context?',
        fidelity: {
          content: 'production-like',
          visual: 'representative',
          interaction: 'interactive',
          behavior: 'representative',
          environment: 'responsive-browser',
        },
        stopWhen: 'Allowed, denied, stale, and conflicting states have a reachable next path.',
      },
    ],
    referencePrinciples: [
      {
        id: 'principle:stable-scan-path',
        sourceIds: ['ref:linear-density', 'ref:slack-triage'],
        dimension: 'hierarchy',
        statement: 'Keep owner, state, impact, and next action in stable scan positions.',
        doNotCopy: ['accent colour', 'sidebar silhouette', 'corner radius'],
        observableConsequence: 'Operators can find the blocked order and next action without opening every item.',
      },
    ],
    rationale: 'The ERP redesign has costly density, permission, and recovery uncertainty.',
  });

  assert.equal(parsed.mode, 'investigate');
  assert.deepEqual(parsed.investigations.map(({ kind }) => kind), [
    'content-state-model',
    'structural-layout',
    'component-in-context',
  ]);
  assert.equal(parsed.referencePrinciples[0]?.dimension, 'hierarchy');
});

test('investigations cannot become ceremonial paperwork', () => {
  assert.throws(
    () => parseDesignDevelopmentContract({
      ...directContract(),
      mode: 'investigate',
      risks: [{
        id: 'risk:hierarchy',
        question: 'Is the primary work visually dominant?',
        consequence: 'medium',
        uncertainty: 'high',
        lateReversalCost: 'medium',
      }],
      investigations: [{
        id: 'probe:moodboard',
        kind: 'structural-layout',
        riskIds: [],
        question: 'Make a wireframe.',
        fidelity: {
          content: 'placeholder',
          visual: 'structural',
          interaction: 'none',
          behavior: 'none',
          environment: 'none',
        },
        stopWhen: 'A document exists.',
      }],
      rationale: 'Follow the process.',
    }),
    /DESIGN_DEVELOPMENT_UNBOUND_INVESTIGATION/,
  );
});

test('reference principles must produce observable decisions without copying aesthetics', () => {
  assert.throws(
    () => parseDesignDevelopmentContract({
      ...directContract(),
      mode: 'investigate',
      risks: [{
        id: 'risk:generic-reference-copy',
        question: 'Will the reference be translated rather than imitated?',
        consequence: 'medium',
        uncertainty: 'high',
        lateReversalCost: 'medium',
      }],
      investigations: [{
        id: 'probe:reference',
        kind: 'reference-principle',
        riskIds: ['risk:generic-reference-copy'],
        question: 'Which transferable principle changes the product decision?',
        fidelity: {
          content: 'representative',
          visual: 'none',
          interaction: 'none',
          behavior: 'none',
          environment: 'none',
        },
        stopWhen: 'Each retained principle has a measurable consequence.',
      }],
      referencePrinciples: [{
        id: 'principle:purple',
        sourceIds: ['ref:linear'],
        dimension: 'hierarchy',
        statement: 'Use Linear purple.',
        doNotCopy: [],
        observableConsequence: 'The page looks like Linear.',
      }],
      rationale: 'Use a fashionable reference.',
    }),
    /DESIGN_DEVELOPMENT_SURFACE_COPY/,
  );
});

test('investigation mode rejects uncovered material risks and duplicate probes', () => {
  const base = {
    ...directContract(),
    mode: 'investigate',
    risks: [{
      id: 'risk:permissions',
      question: 'Can a denied operator recover through the correct approver?',
      consequence: 'high',
      uncertainty: 'high',
      lateReversalCost: 'high',
    }],
    investigations: [{
      id: 'probe:permissions',
      kind: 'component-in-context',
      riskIds: ['risk:permissions'],
      question: 'Does denied state expose the owner and next path?',
      fidelity: {
        content: 'production-like',
        visual: 'representative',
        interaction: 'interactive',
        behavior: 'representative',
        environment: 'responsive-browser',
      },
      stopWhen: 'Denied and allowed paths are both observed.',
    }],
    rationale: 'Permission failure has a costly recovery path.',
  };

  assert.throws(
    () => parseDesignDevelopmentContract({
      ...base,
      investigations: [],
    }),
    /DESIGN_DEVELOPMENT_UNCOVERED_RISK/,
  );
  assert.throws(
    () => parseDesignDevelopmentContract({
      ...base,
      investigations: [base.investigations[0], base.investigations[0]],
    }),
    /DESIGN_DEVELOPMENT_DUPLICATE/,
  );
});
