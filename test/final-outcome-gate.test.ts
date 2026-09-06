import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  FinalOutcomeGateError,
  validateFinalOutcomeGate,
  validateTrustedOutcomeEvidence,
} from '../core/evidence/final-v2-outcome-gate.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import {
  TRUSTED_BROWSER_RECEIPT_SCHEMA,
  trustedBrowserReceiptSha256,
  type TrustedBrowserReceipt,
} from '../core/runtime/trusted-browser-receipt.ts';
import { authorizeTestProjectRunPayloads, createTestProjectRunInvocation } from './helpers/project-write.ts';
import { writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function fixture(entrySurface = false): Readonly<{
  root: string;
  receipt: TrustedBrowserReceipt;
  evidence: unknown;
  invocation: ReturnType<typeof createTestProjectRunInvocation>;
  receiptBytes: Buffer;
  cleanup(): void;
}> {
  const root = mkdtempSync(join(tmpdir(), 'omd-final-outcome-gate-'));
  mkdirSync(join(root, '.omd'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'index.html'), 'current');
  writeFileSync(join(root, 'src', 'app.js'), 'current dependency');
  writeFileSync(join(root, '.omd', 'capture.png'), 'capture');
  writeBrowserDecisionFixture(root);
  const decisionGraphBytes = readFileSync(join(root, '.omd', 'decision-graph.json'));
  const projectionBytes = Buffer.from(`${JSON.stringify({
    schema: 'task-flow-benchmark-projection-v1',
    benchmarkSha256: sha('benchmark'),
    sourceContractSha256: sha('source'),
    surface: 'product',
    domain: 'cold-chain-logistics',
    taskSteps: [
      { id: 'inspect-temperature', intent: 'inspect evidence', dependsOn: [] },
      { id: 'choose-disposition', intent: 'choose disposition', dependsOn: ['inspect-temperature'] },
    ],
    counterexamples: [
      { id: 'dashboard-first', reason: 'hides the exception queue' },
      { id: 'action-first', reason: 'acts before evidence review' },
    ],
  })}\n`);
  if (entrySurface) {
    writeFileSync(join(root, '.omd', 'task-flow-benchmark-projection.json'), projectionBytes);
  }
  const receipt: TrustedBrowserReceipt = {
    schema: TRUSTED_BROWSER_RECEIPT_SCHEMA,
    runId: 'final-outcome-gate',
    routeSha256: sha('route'),
    sourceContractSha256: sha('source'),
    activationBuildSha256: sha('build'),
    productionRevisionSha256: servedProjectTreeSha256(root, 'src/index.html'),
    productionPath: 'src/index.html',
    testedUrl: 'http://127.0.0.1:1/index.html',
    decisionGraphSha256: sha(decisionGraphBytes),
    outcomeResults: [{ outcomeRef: 'outcome:usable', status: 'pass', findings: [] }],
    confirmedClaimRefs: ['claim:confirmed'],
    decisionRefs: ['decision:layout'],
    hardFloors: { behavior: 'pass', access: 'pass', safety: 'pass' },
    captures: [{ path: '.omd/capture.png', sha256: sha('capture'), width: 1280, height: 900 }],
    transcript: [`assertion-pass:${sha('assertion')}`],
    ...(entrySurface ? {
      entrySurface: {
        benchmarkProjectionSha256: sha(projectionBytes),
        prerequisiteTaskId: 'inspect-temperature',
        dependentTaskId: 'choose-disposition',
        status: 'pass' as const,
      },
    } : {}),
  };
  const receiptSha256 = trustedBrowserReceiptSha256(receipt);
  const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`);
  writeFileSync(
    join(root, '.omd', `trusted-browser-receipt-sha256-${receiptSha256}.json`),
    receiptBytes,
  );
  const evidence = {
    trustedOutcome: {
      schema: 'trusted-outcome-observation-v1',
      receiptSha256,
      routeSha256: receipt.routeSha256,
      sourceContractSha256: receipt.sourceContractSha256,
      activationBuildSha256: receipt.activationBuildSha256,
      productionRevisionSha256: receipt.productionRevisionSha256,
      outcomeResults: receipt.outcomeResults,
      confirmedClaimRefs: receipt.confirmedClaimRefs,
      decisionRefs: receipt.decisionRefs,
      hardFloors: receipt.hardFloors,
      captureSha256s: receipt.captures.map((capture) => capture.sha256),
      transcriptSha256: sha(canonicalJson(receipt.transcript)),
      ...(receipt.entrySurface === undefined ? {} : { entrySurface: receipt.entrySurface }),
    },
  };
  const invocation = createTestProjectRunInvocation(root, 'final-outcome-gate');
  return { root, receipt, evidence, invocation, receiptBytes, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('benchmark final gate requires a current passing entry surface edge', () => {
  const value = fixture(true);
  try {
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'product-probe-result',
      payload: value.receiptBytes,
    }]);
    const input = {
      root: value.root,
      branch: 'adaptive-omission' as const,
      required: true,
      invocation: value.invocation,
      expected: {
        routeSha256: value.receipt.routeSha256,
        sourceContractSha256: value.receipt.sourceContractSha256,
        buildSha256: value.receipt.activationBuildSha256,
        entrySurfaceRequired: true,
      },
      observations: [{
        evidence: value.evidence,
        buildSha256: value.receipt.activationBuildSha256,
      }],
    };
    assert.doesNotThrow(() => validateTrustedOutcomeEvidence(input));

    writeFileSync(
      join(value.root, '.omd', 'task-flow-benchmark-projection.json'),
      '{}',
    );
    assert.throws(
      () => validateTrustedOutcomeEvidence(input),
      (error: unknown) => error instanceof FinalOutcomeGateError
        && error.code === 'STALE_FINAL_OUTCOME_BINDING',
    );
  } finally { value.cleanup(); }
});

test('entry-surface machine RED is terminal despite otherwise passing declarations', () => {
  const value = fixture(true);
  try {
    const trustedOutcome = (value.evidence as {
      trustedOutcome: Record<string, unknown>;
    }).trustedOutcome;
    assert.throws(
      () => validateFinalOutcomeGate({
        branch: 'adaptive-omission',
        trustedOutcome: {
          ...trustedOutcome,
          entrySurface: {
            ...(trustedOutcome.entrySurface as Record<string, unknown>),
            status: 'fail',
          },
        },
        expectedProductionRevisionSha256: value.receipt.productionRevisionSha256,
      }),
      (error: unknown) => error instanceof FinalOutcomeGateError
        && error.code === 'FINAL_ACCESS_FAILED',
    );
  } finally { value.cleanup(); }
});

test('final gate rejects a fabricated durable receipt and accepts exact host-authorized bytes', () => {
  const value = fixture();
  try {
    const input = {
      root: value.root,
      branch: 'adaptive-omission' as const,
      required: true,
      invocation: value.invocation,
      expected: {
        routeSha256: value.receipt.routeSha256,
        sourceContractSha256: value.receipt.sourceContractSha256,
        buildSha256: value.receipt.activationBuildSha256,
        requiredOutcomeRefs: value.receipt.outcomeResults.map((result) => result.outcomeRef),
        confirmedClaimRefs: value.receipt.confirmedClaimRefs,
        decisionRefs: value.receipt.decisionRefs,
      },
      observations: [{ evidence: value.evidence, buildSha256: value.receipt.activationBuildSha256 }],
    };
    assert.throws(
      () => validateTrustedOutcomeEvidence(input),
      (error) => error instanceof FinalOutcomeGateError
        && error.code === 'UNAUTHORIZED_FINAL_OUTCOME_RECEIPT',
    );
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'product-probe-result',
      payload: value.receiptBytes,
    }]);
    assert.doesNotThrow(() => validateTrustedOutcomeEvidence(input));
  } finally { value.cleanup(); }
});

test('final gate requires exact route source and reference sets', () => {
  const value = fixture();
  try {
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'product-probe-result',
      payload: value.receiptBytes,
    }]);
    const observations = [{
      evidence: value.evidence,
      buildSha256: value.receipt.activationBuildSha256,
    }];
    for (const expected of [
      {
        routeSha256: sha('wrong-route'),
        sourceContractSha256: value.receipt.sourceContractSha256,
        buildSha256: value.receipt.activationBuildSha256,
      },
      {
        routeSha256: value.receipt.routeSha256,
        sourceContractSha256: sha('wrong-source'),
        buildSha256: value.receipt.activationBuildSha256,
      },
    ]) {
      assert.throws(() => validateTrustedOutcomeEvidence({
        root: value.root,
        branch: 'adaptive-omission',
        required: true,
        invocation: value.invocation,
        expected,
        observations,
      }), (error) => error instanceof FinalOutcomeGateError
        && error.code === 'STALE_FINAL_OUTCOME_BINDING');
    }
    assert.throws(() => validateTrustedOutcomeEvidence({
      root: value.root,
      branch: 'adaptive-omission',
      required: true,
      invocation: value.invocation,
      expected: {
        buildSha256: value.receipt.activationBuildSha256,
        requiredOutcomeRefs: ['outcome:different'],
        confirmedClaimRefs: value.receipt.confirmedClaimRefs,
        decisionRefs: value.receipt.decisionRefs,
      },
      observations,
    }), (error) => error instanceof FinalOutcomeGateError
      && error.code === 'STALE_FINAL_OUTCOME_REFS');
  } finally { value.cleanup(); }
});

test('final gate rejects stale capture and decision graph bytes', () => {
  const value = fixture();
  try {
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'product-probe-result',
      payload: value.receiptBytes,
    }]);
    const input = {
      root: value.root,
      branch: 'adaptive-omission' as const,
      required: true,
      invocation: value.invocation,
      expected: { buildSha256: value.receipt.activationBuildSha256 },
      observations: [{ evidence: value.evidence, buildSha256: value.receipt.activationBuildSha256 }],
    };
    writeFileSync(join(value.root, '.omd', 'capture.png'), 'changed');
    assert.throws(() => validateTrustedOutcomeEvidence(input),
      (error) => error instanceof FinalOutcomeGateError
        && error.code === 'STALE_FINAL_OUTCOME_CAPTURE');
    writeFileSync(join(value.root, '.omd', 'capture.png'), 'capture');
    writeFileSync(join(value.root, '.omd', 'decision-graph.json'), '{}');
    assert.throws(() => validateTrustedOutcomeEvidence(input),
      (error) => error instanceof FinalOutcomeGateError
        && error.code === 'STALE_FINAL_OUTCOME_DECISION_GRAPH');
  } finally { value.cleanup(); }
});

test('final gate accepts a retained receipt bound to current route source build and production', () => {
  const value = fixture();
  try {
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'product-probe-result',
      payload: value.receiptBytes,
    }]);
    assert.doesNotThrow(() => validateTrustedOutcomeEvidence({
      invocation: value.invocation,
      root: value.root,
      branch: 'adaptive-omission',
      required: true,
      expected: {
        routeSha256: value.receipt.routeSha256,
        sourceContractSha256: value.receipt.sourceContractSha256,
        buildSha256: value.receipt.activationBuildSha256,
      },
      observations: [{ evidence: value.evidence, buildSha256: value.receipt.activationBuildSha256 }],
    }));
  } finally { value.cleanup(); }
});

test('final gate rejects missing evaluation and stale production bytes', () => {
  const value = fixture();
  try {
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'product-probe-result',
      payload: value.receiptBytes,
    }]);
    assert.throws(
      () => validateTrustedOutcomeEvidence({
        root: value.root,
        branch: 'adaptive-omission',
        required: true,
        invocation: value.invocation,
        expected: { buildSha256: value.receipt.activationBuildSha256 },
        observations: [],
      }),
      (error) => error instanceof FinalOutcomeGateError
        && error.code === 'MISSING_FINAL_OUTCOME_EVALUATION',
    );
    writeFileSync(join(value.root, 'src', 'app.js'), 'changed dependency');
    assert.throws(
      () => validateTrustedOutcomeEvidence({
        root: value.root,
        branch: 'adaptive-omission',
        required: true,
        invocation: value.invocation,
        expected: { buildSha256: value.receipt.activationBuildSha256 },
        observations: [{ evidence: value.evidence, buildSha256: value.receipt.activationBuildSha256 }],
      }),
      (error) => error instanceof FinalOutcomeGateError && error.code === 'STALE_FINAL_OUTCOME_BINDING',
    );
  } finally { value.cleanup(); }
});
