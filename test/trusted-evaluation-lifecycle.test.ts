import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { runTrustedLifecycle } from '../adapters/trusted-lifecycle-runtime.ts';
import {
  parseTrustedLifecycleManifest,
  trustedEvaluationPlanBytes,
} from '../core/runtime/trusted-evaluation-contract.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { redactObservationEvidence } from '../core/runtime/observation.ts';
import {
  FinalOutcomeGateError,
  validateFinalOutcomeGate,
} from '../core/evidence/final-v2-outcome-gate.ts';
import { writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import {
  authorizeTestProjectRunPayloads,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';

const cli = new URL('../bin/omd.mjs', import.meta.url);
const projectContract = {
  schema: 'trusted-project-contract-v1',
  taskOutcome: {
    schema: 'task-outcome-contract-v1',
    goal: 'Submit an order',
    mustHave: ['Order submission succeeds'],
    mustNotHave: ['Submit twice'],
    completionEvidence: ['Visible Order submitted status'],
    strategyFreedom: ['Visual treatment'],
  },
  evidenceClaims: {
    schema: 'evidence-claim-publication-v1',
    claims: [{
      id: 'claim:user-role',
      text: 'The user is a buyer',
      status: 'confirmed',
      userEvidence: [{
        kind: 'explicit-user-evidence',
        source: 'user-message',
        reference: 'brief:1',
        excerpt: 'buyer',
      }],
    }],
    userFacts: ['claim:user-role'],
    workingContext: [],
  },
  allowedPaths: ['index.html'],
  decisionRefs: [`decision:${'a'.repeat(64)}:0`],
};

function runLifecycle(root: string, manifest: string) {
  return spawnSync(process.execPath, [
    cli.pathname,
    'lifecycle',
    'run',
    '--project',
    root,
    '--manifest',
    manifest,
  ], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('lifecycle CLI exposes honest evaluate repair and finalize surfaces', () => {
  const result = spawnSync(process.execPath, [cli.pathname, 'lifecycle', '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /run\|evaluate/);
  assert.match(result.stdout, /lifecycle repair/);
  assert.match(result.stdout, /lifecycle finalize/);
  assert.doesNotMatch(result.stdout, /FINAL: PASS/);
});

test('lifecycle finalize dispatches to the guarded v2 finalizer', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-lifecycle-finalize-dispatch-'));
  try {
    const activation = join(root, 'activation.json');
    const input = join(root, 'final.json');
    writeFileSync(activation, '{}');
    writeFileSync(input, '{}');
    const result = spawnSync(process.execPath, [
      cli.pathname,
      'lifecycle',
      'finalize',
      '--project',
      root,
      '--activation',
      activation,
      '--input',
      input,
    ], { encoding: 'utf8' });
    const direct = spawnSync(process.execPath, [
      cli.pathname,
      'evidence',
      'v2',
      'finalize',
      '--activation',
      activation,
      '--input',
      input,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.status, direct.status);
    assert.equal(result.stderr, direct.stderr);
    assert.doesNotMatch(result.stderr, /usage: omd evidence finalize/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects caller-authored evidence with a typed authority error', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-lifecycle-forged-'));
  try {
    writeFileSync(join(root, 'index.html'), '<button>Submit order</button>');
    const manifest = join(root, 'forged.json');
    writeFileSync(manifest, JSON.stringify({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'index.html',
      authority: {
        purpose: 'trusted-browser-receipt',
        sha256: 'f'.repeat(64),
      },
      scripts: [],
    }));

    const result = runLifecycle(root, manifest);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LIFECYCLE_MANIFEST_AUTHORITY_FORBIDDEN/);
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), '<button>Submit order</button>');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('persisted adaptive route supplies the exact lifecycle route and source identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-lifecycle-route-'));
  try {
    mkdirSync(join(root, 'src', 'copy'), { recursive: true });
    const routeInput = JSON.parse(readFileSync(
      new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url),
      'utf8',
    )) as unknown;
    const invocation = publishTestAdaptiveRoute(root, routeInput, 'trusted-route-lifecycle');
    writeBrowserDecisionFixture(root);
    writeFileSync(join(root, 'src', 'copy', 'index.html'), [
      '<button id="check">Check</button>',
      '<p role="status">Approved confirmation sentence.</p>',
    ].join('\n'));
    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'src/copy/index.html',
      scripts: [{
        outcomeRef: 'mustHave:0',
        actions: [],
        assertions: [{
          kind: 'visible-text',
          selector: '[role=status]',
          text: 'Approved confirmation sentence.',
        }],
      }, {
        outcomeRef: 'mustNotHave:0',
        actions: [],
        assertions: [{
          kind: 'absent-text',
          selector: 'body',
          text: 'Changed confirmation flow',
        }],
      }, {
        outcomeRef: 'completionEvidence:0',
        actions: [],
        assertions: [{
          kind: 'visible-text',
          selector: '[role=status]',
          text: 'Approved confirmation sentence.',
        }],
      }],
    }));
    const authorizedPlan = parseTrustedLifecycleManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown,
    );
    await assert.rejects(
      () => runTrustedLifecycle({
        project: root,
        manifestPath,
        cliPath: new URL('../bin/omd.ts', import.meta.url).pathname,
        argv: ['lifecycle', 'run'],
        invocation,
      }),
      /does not authorize the exact product-probe-result payload/,
    );
    authorizeTestProjectRunPayloads(root, invocation, [{
      purpose: 'product-probe-result',
      payload: trustedEvaluationPlanBytes(authorizedPlan),
    }]);

    const result = await runTrustedLifecycle({
      project: root,
      manifestPath,
      cliPath: new URL('../bin/omd.ts', import.meta.url).pathname,
      argv: ['lifecycle', 'run'],
      invocation,
    });
    assert.equal(result.readyForFinalization, true);
    const receipt = JSON.parse(readFileSync(join(root, result.receiptPath), 'utf8')) as {
      routeSha256: string;
      sourceContractSha256: string;
      productionPath: string;
      outcomeResults: readonly { outcomeRef: string }[];
      decisionGraphSha256: string;
    };
    const route = readPersistedRoute(root, invocation);
    assert.equal(receipt.routeSha256, adaptiveRouteRecordSha256(route));
    assert.equal(receipt.sourceContractSha256, route.sourceContractSha256);
    assert.equal(receipt.productionPath, 'src/copy/index.html');
    assert.deepEqual(
      receipt.outcomeResults.map((entry) => entry.outcomeRef.split(':')[2]),
      ['mustHave', 'mustNotHave', 'completionEvidence'],
    );
    assert.equal(
      receipt.decisionGraphSha256,
      createHash('sha256').update(readFileSync(join(root, '.omd', 'decision-graph.json'))).digest('hex'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publishes trusted observation linked to outcome claim decision build transcript and capture', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-lifecycle-pass-'));
  try {
    mkdirSync(join(root, '.omd'), { recursive: true });
    writeFileSync(
      join(root, '.omd', 'trusted-lifecycle-contract.json'),
      JSON.stringify(projectContract),
    );
    writeFileSync(join(root, 'index.html'), [
      '<button id="submit">Submit order</button>',
      '<p role="status" hidden>Order submitted</p>',
      '<script>',
      'document.querySelector("#submit").addEventListener("click", () => {',
      '  document.querySelector("[role=status]").hidden = false;',
      '});',
      '</script>',
    ].join('\n'));
    const manifest = join(root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'index.html',
      scripts: [{
        outcomeRef: 'mustHave:0',
        actions: [{ kind: 'click', selector: '#submit' }],
        assertions: [{
          kind: 'visible-text',
          selector: '[role=status]',
          text: 'Order submitted',
        }],
      }, {
        outcomeRef: 'mustNotHave:0',
        actions: [],
        assertions: [{
          kind: 'absent-text',
          selector: 'body',
          text: 'Order submitted twice',
        }],
      }, {
        outcomeRef: 'completionEvidence:0',
        actions: [],
        assertions: [{
          kind: 'visible-text',
          selector: '[role=status]',
          text: 'Order submitted',
        }],
      }],
    }));

    const result = runLifecycle(root, manifest);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /EVALUATION: PASS/);
    assert.doesNotMatch(result.stdout, /READY_FOR_FINALIZATION/);
    const receiptMatch = result.stdout.match(/receipt: (.+)/);
    const observationMatch = result.stdout.match(/observation: (.+)/);
    assert.ok(receiptMatch);
    assert.ok(observationMatch);
    const receiptPath = receiptMatch[1];
    const observationPath = observationMatch[1];
    assert.ok(receiptPath);
    assert.ok(observationPath);
    const receipt = JSON.parse(readFileSync(join(root, receiptPath), 'utf8')) as {
      outcomeResults?: unknown;
      confirmedClaimRefs?: unknown;
      decisionRefs?: unknown;
      activationBuildSha256?: unknown;
      transcript?: unknown;
      captures?: unknown;
    };
    const observation = JSON.parse(readFileSync(join(root, observationPath), 'utf8')) as {
      evidence?: {
        trustedOutcome?: {
          confirmedClaimRefs?: unknown;
          decisionRefs?: unknown;
          outcomeResults?: unknown;
        };
      };
    };
    assert.ok(receipt.outcomeResults);
    assert.ok(receipt.confirmedClaimRefs);
    assert.ok(receipt.decisionRefs);
    assert.ok(receipt.activationBuildSha256);
    assert.ok(receipt.transcript);
    assert.ok(receipt.captures);
    assert.deepEqual(
      observation.evidence?.trustedOutcome?.confirmedClaimRefs,
      receipt.confirmedClaimRefs,
    );
    assert.deepEqual(
      observation.evidence?.trustedOutcome?.decisionRefs,
      receipt.decisionRefs,
    );
    assert.deepEqual(
      observation.evidence?.trustedOutcome?.outcomeResults,
      redactObservationEvidence(receipt.outcomeResults),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const trustedOutcome = (overrides: Record<string, unknown> = {}) => ({
  schema: 'trusted-outcome-observation-v1',
  receiptSha256: 'a'.repeat(64),
  routeSha256: 'b'.repeat(64),
  sourceContractSha256: 'c'.repeat(64),
  activationBuildSha256: 'd'.repeat(64),
  productionRevisionSha256: 'e'.repeat(64),
  outcomeResults: [{ outcomeRef: 'outcome:required', status: 'pass', findings: [] }],
  confirmedClaimRefs: ['claim:confirmed'],
  decisionRefs: ['decision:current'],
  hardFloors: { behavior: 'pass', access: 'pass', safety: 'pass' },
  captureSha256s: ['f'.repeat(64)],
  transcriptSha256: '1'.repeat(64),
  ...overrides,
});

test('a no-op action cannot pass against pre-existing success copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-lifecycle-noop-'));
  try {
    mkdirSync(join(root, '.omd'), { recursive: true });
    writeFileSync(
      join(root, '.omd', 'trusted-lifecycle-contract.json'),
      JSON.stringify(projectContract),
    );
    writeFileSync(
      join(root, 'index.html'),
      '<button id="submit">Submit order</button><p role="status">Order submitted</p>',
    );
    const manifest = join(root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'index.html',
      scripts: [{
        outcomeRef: 'mustHave:0',
        actions: [{ kind: 'click', selector: '#submit' }],
        assertions: [{
          kind: 'visible-text',
          selector: '[role=status]',
          text: 'Order submitted',
        }],
      }, {
        outcomeRef: 'mustNotHave:0',
        actions: [],
        assertions: [{
          kind: 'absent-text',
          selector: 'body',
          text: 'Order submitted twice',
        }],
      }, {
        outcomeRef: 'completionEvidence:0',
        actions: [],
        assertions: [{
          kind: 'visible-text',
          selector: '[role=status]',
          text: 'Order submitted',
        }],
      }],
    }));

    const result = runLifecycle(root, manifest);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /EVALUATION: FAIL/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('blocks behavior failure across final branches', () => {
  const failed = trustedOutcome({
    outcomeResults: [{
      outcomeRef: 'outcome:required',
      status: 'fail',
      findings: ['submit-action-failed'],
    }],
    hardFloors: { behavior: 'fail', access: 'pass', safety: 'pass' },
  });
  for (const branch of ['art-selected', 'adaptive-omission'] as const) {
    assert.throws(
      () => validateFinalOutcomeGate({
        branch,
        trustedOutcome: failed,
        expectedProductionRevisionSha256: 'e'.repeat(64),
      }),
      (error: unknown) => error instanceof FinalOutcomeGateError
        && error.code === 'FINAL_BEHAVIOR_FAILED',
    );
  }
});

test('rejects stale repair evidence', () => {
  assert.throws(
    () => validateFinalOutcomeGate({
      branch: 'adaptive-omission',
      trustedOutcome: trustedOutcome(),
      expectedProductionRevisionSha256: '9'.repeat(64),
    }),
    (error: unknown) => error instanceof FinalOutcomeGateError
      && error.code === 'STALE_FINAL_OUTCOME_PRODUCTION',
  );
});
