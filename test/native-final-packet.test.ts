import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as packets from '../core/runtime/native-final-packet.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { nativeOutcomeExecutionEvidence, validateNativeOutcomeAssessments, validateCurrentOutcomeAssessments } from '../core/runtime/native-outcome-review.ts';
import { finalRenderReviewerPacket, FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA } from '../core/runtime/final-render-review.ts';
import { ReviewerEvidenceProxy } from '../core/runtime/evidence-proxy.ts';
import type { ReviewerText } from '../core/runtime/reviewer-text.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';
import { observationV2Sha256, validateObservationV2 } from '../core/runtime/observation.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { publishConsultedReferences } from '../core/design/consulted-references.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { browserFixturePng } from './helpers/browser-observation-decision-links.ts';
import { modelLedCompletionFingerprint } from '../core/runtime/model-led-execution.ts';

test('final reviewer response identities distinguish handbacks from downstream lane records', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    const blind = JSON.parse(finalRenderReviewerPacket({
      ...fixture, packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s: fixture.observationSha256s },
    }).toString());
    assert.deepEqual(blind.outputContract.responseIdentity, { schema: FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA, lane: 'blindLane' });
    for (const lane of ['fidelityLane', 'protocolLane'] as const) {
      const packet = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane }).toString());
      assert.deepEqual(packet.outputContract.responseIdentity, { schema: 'adaptive-final-reviewer-handback-v1', lane });
      assert.notEqual(packet.outputContract.responseIdentity.schema, packet.outputContract.laneSchema);
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('reported whole originals reach fidelity without leaking source locators or entering blind quality review', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    const route = readPersistedRoute(fixture.root, fixture.invocation);
    const png = browserFixturePng(16, 16);
    writeFileSync(join(fixture.root, 'original.png'), png);
    const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
    const observation = fixture.observationSha256s.at(-1);
    assert.ok(observation);
    const execution = nativeOutcomeExecutionEvidence(fixture.root, fixture.invocation, observation);
    const manifest = parseTrustedLifecycleManifest(JSON.parse(readFileSync(
      join(fixture.root, `.omd/evaluation-plans/sha256-${execution.executionPlanSha256}.json`), 'utf8')));
    const beforeReferences = modelLedCompletionFingerprint(fixture.root, manifest);
    const published = publishConsultedReferences(fixture.root, {
      schema: 'consulted-references-input-v1', requestSha256: hash(route.request),
      images: [{ path: 'original.png', sha256: hash(png), sourceUrl: 'https://example.com/studio', role: 'primary' }],
    }, createTestProjectWriteAdapter(fixture.root, fixture.invocation));
    assert.notEqual(modelLedCompletionFingerprint(fixture.root, manifest), beforeReferences);
    const fidelity = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }).toString());
    assert.equal(fidelity.evidence.consultedReferences.sha256, published.sha256);
    assert.equal(fidelity.evidence.referenceRenders[0].role, 'consulted-external-original');
    assert.equal(fidelity.evidence.referenceRenders[0].pngBase64, png.toString('base64'));
    assert.deepEqual(
      fidelity.evidence.consultedReferenceComparisonExpectations.map(
        (row: { component: string; state: string; viewport: string }) =>
          [row.component, row.state, row.viewport],
      ),
      [['page', 'default', 'desktop'], ['page', 'default', 'mobile']],
    );
    assert.ok(fidelity.outputContract.reviewerFields.includes('consultedReferenceComparisons'));
    assert.equal(JSON.stringify(fidelity).includes('example.com'), false);
    const protocol = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }).toString());
    assert.equal(protocol.evidence.referenceRenders.length, 0);
    const blind = JSON.parse(finalRenderReviewerPacket({ ...fixture,
      packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s: fixture.observationSha256s },
    }).toString());
    assert.equal(blind.evidence.consultedReferenceRenders, undefined);
    writeFileSync(join(fixture.root, `.omd/consulted-references/images/${hash(png)}.png`), 'tampered');
    assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }));
    assert.throws(() => modelLedCompletionFingerprint(fixture.root, manifest));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('consulted interaction state without matching product state refuses final packet without observation mutation', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    const route = readPersistedRoute(fixture.root, fixture.invocation);
    const png = browserFixturePng(16, 16);
    const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
    writeFileSync(join(fixture.root, 'hover-original.png'), png);
    publishConsultedReferences(fixture.root, {
      schema: 'consulted-references-input-v2',
      requestSha256: hash(route.request),
      images: [{
        path: 'hover-original.png',
        sha256: hash(png),
        sourceUrl: 'https://example.com/hover',
        role: 'primary',
        component: 'primary-action',
        state: 'hover',
      }],
    }, createTestProjectWriteAdapter(fixture.root, fixture.invocation));
    const observationPath = join(fixture.root, '.omd/observation-v2.json');
    const before = readFileSync(observationPath);
    assert.throws(
      () => packets.nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }),
      /missing product state coverage/,
    );
    assert.deepEqual(readFileSync(observationPath), before);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('consulted interaction state pairs only with corresponding product component state and viewport', () => {
  const fixture = prepareFinalRenderReviewFixture('copy-only', {
    stateCapture: { component: 'primary-action', state: 'hover' },
  });
  try {
    const route = readPersistedRoute(fixture.root, fixture.invocation);
    const png = browserFixturePng(16, 16);
    const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
    writeFileSync(join(fixture.root, 'hover-original.png'), png);
    publishConsultedReferences(fixture.root, {
      schema: 'consulted-references-input-v2',
      requestSha256: hash(route.request),
      images: [{
        path: 'hover-original.png',
        sha256: hash(png),
        sourceUrl: 'https://example.com/hover',
        role: 'primary',
        component: 'primary-action',
        state: 'hover',
      }],
    }, createTestProjectWriteAdapter(fixture.root, fixture.invocation));
    const packet = JSON.parse(packets.nativeFinalLanePacket({
      ...fixture,
      lane: 'fidelityLane',
    }).toString());
    assert.deepEqual(packet.evidence.consultedReferenceComparisonExpectations.map(
      (row: { component: string; state: string; viewport: string }) =>
        [row.component, row.state, row.viewport],
    ), [
      ['primary-action', 'hover', 'desktop'],
      ['primary-action', 'hover', 'mobile'],
    ]);
    assert.equal(packet.evidence.consultedReferenceComparisonExpectations.some(
      (row: { state: string }) => row.state === 'default',
    ), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

for (const lane of ['fidelityLane', 'protocolLane'] as const) {
  test(`Given authenticated observations When ${lane} packet is derived Then bindings and production images are host-derived`, () => {
    const fixture = prepareFinalRenderReviewFixture();
    try {
      writeFileSync(join(fixture.root, '.omd/functional-requirements.json'), JSON.stringify({ screen: 'requested-screen' }));
      const bytes = packets.nativeFinalLanePacket({ ...fixture, lane });
      const packet = JSON.parse(bytes.toString());
      assert.equal(packet.schema, 'native-pi-final-lane-transport-v1');
      assert.equal(packet.outputContract.lane, lane);
      assert.deepEqual(packet.outputContract.fixedBindings.observationSha256s, fixture.observationSha256s);
      assert.equal(packet.outputContract.fixedBindings.briefSha256, fixture.invocation.current.briefSha256);
      assert.ok(packet.evidence.renders.every((image: { pngBase64: string }) => image.pngBase64.length > 0));
      assert.equal(packet.evidence.referenceRenders.length, 0);
      assert.ok(packet.evidence.documents.some((doc: { path: string }) => doc.path === '.omd/copy-deck.md'));
      assert.ok(packet.evidence.documents.some((doc: { path: string }) => doc.path === '.omd/functional-requirements.json'));
      if (lane === 'protocolLane') {
        assert.ok(packet.evidence.outcomeExecution.outcomes.length > 0);
        assert.ok(packet.evidence.outcomeExecution.outcomes.every(
          (outcome: { requirement: string; assertions: unknown[] }) => outcome.requirement.length > 0 && outcome.assertions.length > 0));
        assert.ok(packet.outputContract.reviewerFields.includes('outcomeAssessments'));
      }
      writeFileSync(join(fixture.root, '.omd/copy-deck.md'), '# Changed copy\n');
      assert.notDeepEqual(packets.nativeFinalLanePacket({ ...fixture, lane }), bytes);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
}

test('Given a forged observation digest When deriving a native packet Then it is refused before publication', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane', observationSha256s: ['a'.repeat(64)] }));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('outcome assessments require exact current coverage and evidence while allowing shared captures', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    const observation = fixture.observationSha256s.at(-1);
    assert.ok(observation);
    const evidence = nativeOutcomeExecutionEvidence(fixture.root, fixture.invocation, observation);
    const assessments = evidence.outcomes.map(outcome => ({
      outcomeRef: outcome.outcomeRef, verdict: 'pass', rationale: 'Observed evidence supports this requirement.',
      receiptSha256: evidence.receiptSha256, executionPlanSha256: evidence.executionPlanSha256,
      captureSha256s: outcome.captures.map(capture => capture.sha256),
    }));
    assert.equal(validateNativeOutcomeAssessments(assessments, evidence).length, evidence.outcomes.length);
    assert.doesNotThrow(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, observation, assessments));
    assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, observation, undefined));
    assert.throws(() => validateNativeOutcomeAssessments(undefined, evidence));
    assert.throws(() => validateNativeOutcomeAssessments(assessments.slice(1), evidence));
    for (const change of [
      { verdict: 'fail' }, { verdict: 'insufficient' }, { rationale: '' },
      { receiptSha256: 'a'.repeat(64) }, { executionPlanSha256: 'b'.repeat(64) },
      { outcomeRef: 'unrelated' }, { captureSha256s: ['c'.repeat(64)] },
    ]) {
      assert.throws(() => validateNativeOutcomeAssessments(
        assessments.map((row, index) => index === 0 ? { ...row, ...change } : row), evidence));
      assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, observation,
        assessments.map((row, index) => index === 0 ? { ...row, ...change } : row)));
    }
    const failedExecution = { ...evidence, outcomes: evidence.outcomes.map(
      (row, index) => index === 0 ? { ...row, executionStatus: 'fail' as const } : row) };
    assert.throws(() => validateNativeOutcomeAssessments(assessments, failedExecution));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('protocol review refuses a replaced or missing execution plan without changing observation evidence', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    const packet = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }).toString());
    const planPath = join(fixture.root, `.omd/evaluation-plans/sha256-${packet.evidence.outcomeExecution.executionPlanSha256}.json`);
    const observationPath = join(fixture.root, '.omd/observation-v2.json');
    const before = readFileSync(observationPath);
    writeFileSync(planPath, '{}');
    assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }), /execution plan changed/);
    rmSync(planPath);
    assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }));
    assert.deepEqual(readFileSync(observationPath), before);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('protocol review preserves reordered execution identities and reload actions', () => {
  const fixture = prepareFinalRenderReviewFixture('copy-only', {
    executionScripts: scripts => [...scripts].reverse().map(script => ({
      ...script, actions: [{ kind: 'reload', viewports: ['390x844'] }],
    })),
  });
  try {
    const observation = fixture.observationSha256s.at(-1);
    assert.ok(observation);
    const route = readPersistedRoute(fixture.root, fixture.invocation);
    const requirements = (['mustHave', 'mustNotHave', 'completionEvidence'] as const)
      .flatMap(kind => route.sourceContract.taskOutcome[kind].map(requirement => ({ kind, requirement }))).reverse();
    const evidence = nativeOutcomeExecutionEvidence(fixture.root, fixture.invocation, observation);
    const planPath = join(fixture.root, `.omd/evaluation-plans/sha256-${evidence.executionPlanSha256}.json`);
    const before = readFileSync(planPath);
    const plan = parseTrustedLifecycleManifest(JSON.parse(before.toString()));
    assert.ok(plan.scripts.length > 1);
    assert.deepEqual(evidence.outcomes.map(row => row.outcomeRef), plan.scripts.map(row => row.outcomeRef));
    assert.deepEqual(evidence.outcomes.map(({ kind, requirement }) => ({ kind, requirement })), requirements);
    assert.ok(evidence.outcomes.every(row => row.executionStatus === 'pass'));
    assert.deepEqual(evidence.outcomes.map(row => row.actions), plan.scripts.map(row => row.actions));
    const packet = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }).toString());
    assert.deepEqual(packet.evidence.outcomeExecution.outcomes, evidence.outcomes);
    assert.deepEqual(readFileSync(planPath), before);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('protocol review refuses missing duplicate or foreign execution identities without mutation', () => {
  for (const violation of ['missing', 'duplicate', 'foreign'] as const) {
    const fixture = prepareFinalRenderReviewFixture('copy-only', {
      executionScripts: scripts => {
        const first = scripts[0];
        assert.ok(first);
        switch (violation) {
          case 'missing': return scripts.slice(1);
          case 'duplicate': return scripts.map((script, index) => index === 1 ? first : script);
          case 'foreign': return scripts.map((script, index) => index === 0
            ? { ...script, outcomeRef: 'unrelated-outcome' } : script);
        }
      },
    });
    try {
      const pointerPath = join(fixture.root, '.omd/observation-v2.json');
      const before = readFileSync(pointerPath);
      assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }),
        /execution coverage/);
      assert.deepEqual(readFileSync(pointerPath), before);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }
});

test('protocol review delivers each executed reload without replacing it with null', () => {
  const fixture = prepareFinalRenderReviewFixture('copy-only', {
    executionScripts: scripts => scripts.map(script => ({ ...script, actions: [{ kind: 'reload' }] })),
  });
  try {
    const packet = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }).toString());
    for (const outcome of packet.evidence.outcomeExecution.outcomes) {
      assert.deepEqual(outcome.actions, [{ kind: 'reload' }]);
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('large repetitive executed input fits the unchanged reviewer broker without changing its source plan', () => {
  const value = `Q${' '.repeat(9 * 1024 * 1024)}Q`;
  const fixture = prepareFinalRenderReviewFixture('copy-only', { fillValue: value });
  try {
    const observation = fixture.observationSha256s.at(-1);
    assert.ok(observation);
    const original = nativeOutcomeExecutionEvidence(fixture.root, fixture.invocation, observation);
    const path = join(fixture.root, `.omd/evaluation-plans/sha256-${original.executionPlanSha256}.json`);
    const before = readFileSync(path);
    const bytes = packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' });
    assert.doesNotThrow(() => new ReviewerEvidenceProxy().create(bytes));
    const packet = JSON.parse(bytes.toString('utf8'));
    const projected: ReviewerText = packet.evidence.outcomeExecution.outcomes[0].actions[0].value;
    assert.notEqual(typeof projected, 'string');
    if (typeof projected !== 'string') {
      const decoded = projected.segments.map(part =>
        typeof part === 'string' ? part : String.fromCharCode(part.codeUnit).repeat(part.repeat),
      ).join('');
      assert.equal(decoded, value);
      assert.equal(projected.utf16Length, value.length);
      assert.equal(projected.jsonSha256, createHash('sha256').update(JSON.stringify(value)).digest('hex'));
    }
    const plan = parseTrustedLifecycleManifest(JSON.parse(before.toString('utf8')));
    assert.deepEqual(packet.evidence.outcomeExecution.outcomes.map((row: { outcomeRef: string }) => row.outcomeRef),
      plan.scripts.map(row => row.outcomeRef));
    assert.deepEqual(packet.evidence.outcomeExecution.outcomes.map((row: { assertions: unknown }) => row.assertions),
      plan.scripts.map(row => row.assertions));
    assert.equal(packet.evidence.renders.length, 2);
    for (const render of packet.evidence.renders) {
      assert.equal(createHash('sha256').update(Buffer.from(render.pngBase64, 'base64')).digest('hex'), render.captureSha256);
    }
    assert.deepEqual(readFileSync(path), before);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('legacy observation descriptors remain readable without granting invented outcome assessment authority', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    const current = fixture.observationSha256s.at(-1);
    assert.ok(current);
    const value = validateObservationV2(JSON.parse(readFileSync(
      join(fixture.root, `.omd/observation-v2/sha256-${current}.json`), 'utf8',
    )));
    assert.ok(typeof value.evidence === 'object' && value.evidence !== null && !Array.isArray(value.evidence));
    const legacy = { ...value, evidence: Object.fromEntries(
      Object.entries(value.evidence).filter(([key]) => key !== 'trustedOutcome'),
    ) };
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
    const digest = createHash('sha256').update(bytes).digest('hex');
    const semantic = observationV2Sha256(legacy);
    assert.notEqual(digest, semantic);
    const path = '.omd/legacy-observation.json';
    writeFileSync(join(fixture.root, path), bytes);
    assert.doesNotThrow(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, digest, undefined, path));
    assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, digest, [], path),
      /assessments require executed outcome evidence/);
    assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, current, undefined, path),
      /observation changed/);
    assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, semantic, undefined, path),
      /observation changed/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
