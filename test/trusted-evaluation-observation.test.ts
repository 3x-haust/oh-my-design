import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { runTrustedBrowserEvaluation } from '../adapters/trusted-browser-runner.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { writeTrustedEvaluationObservation } from '../core/runtime/trusted-evaluation-observation.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';
import { observationV2Sha256, readCurrentObservationV2 } from '../core/runtime/observation.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-observation-'));
  const app = join(root, 'index.html');
  mkdirSync(join(root, '.omd'));
  writeFileSync(app, [
    '<button id="submit">Submit</button>',
    '<p role="status" hidden>Order submitted</p>',
    '<script>document.querySelector("#submit").onclick=()=>{',
    'document.querySelector("[role=status]").hidden=false}</script>',
  ].join(''));
  const invocation = createTestProjectRunInvocation(root);
  const buildBytes = `${JSON.stringify({ buildSha256: invocation.current.buildSha256 })}\n`;
  writeFileSync(join(root, '.omd', 'build.json'), buildBytes);
  const manifest = parseTrustedLifecycleManifest({
    schema: 'trusted-lifecycle-manifest-v1',
    entryPath: 'index.html',
    scripts: [{
      outcomeRef: 'outcome:a',
      actions: [{ kind: 'click', selector: '#submit' }],
      assertions: [{
        kind: 'visible-text',
        selector: '[role=status]',
        text: 'Order submitted',
      }],
    }],
  });
  const evaluation = await runTrustedBrowserEvaluation({
    root,
    manifest,
    binding: {
      runId: 'run-1',
      routeSha256: 'a'.repeat(64),
      sourceContractSha256: 'b'.repeat(64),
      activationBuildSha256: invocation.current.buildSha256,
      productionRevisionSha256: servedProjectTreeSha256(root, 'index.html'),
      productionPath: 'index.html',
      decisionGraphSha256: 'e'.repeat(64),
      requiredOutcomeRefs: ['outcome:a'],
      confirmedClaimRefs: ['claim:a'],
      decisionRefs: ['decision:a'],
    },
    artifacts: {
      write(relativePath, bytes) {
        const target = join(root, relativePath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      },
    },
  });
  return {
    root,
    app,
    invocation,
    evaluation,
    writer: createTestProjectWriteAdapter(root, invocation),
  };
}

test('trusted receipt publishes linked observation and exact predecessor successor', async () => {
  const value = await fixture();
  try {
    const first = writeTrustedEvaluationObservation({
      ...value,
      currentArtifactPath: '.omd/build.json',
      productionArtifactPath: 'index.html',
    });
    const nextEvaluation = await runTrustedBrowserEvaluation({
      root: value.root,
      manifest: parseTrustedLifecycleManifest({
        schema: 'trusted-lifecycle-manifest-v1',
        entryPath: 'index.html',
        scripts: [{
          outcomeRef: 'outcome:a',
          actions: [{ kind: 'click', selector: '#submit' }],
          assertions: [{
            kind: 'visible-text',
            selector: '[role=status]',
            text: 'Order submitted',
          }],
        }],
      }),
      binding: { ...value.evaluation.receipt, runId: 'run-2',
        requiredOutcomeRefs: ['outcome:a'] },
      artifacts: {
        write(relativePath, bytes) {
          const target = join(value.root, relativePath);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, bytes);
        },
      },
    });
    const second = writeTrustedEvaluationObservation({
      root: value.root,
      invocation: value.invocation,
      writer: value.writer,
      evaluation: nextEvaluation,
      currentArtifactPath: '.omd/build.json',
      productionArtifactPath: 'index.html',
    });
    assert.equal(second.predecessorSha256, observationV2Sha256(first));
    assert.equal(
      (second.evidence as { trustedOutcome: { receiptSha256: string } }).trustedOutcome.receiptSha256,
      nextEvaluation.receiptSha256,
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('forged swapped capture and stale production fail before observation pointer mutation', async () => {
  const value = await fixture();
  try {
    const pointer = join(value.root, '.omd', 'observation-v2.json');
    assert.throws(() => writeTrustedEvaluationObservation({
      root: value.root,
      writer: value.writer,
      invocation: value.invocation,
      evaluation: {
        receipt: value.evaluation.receipt,
        receiptSha256: value.evaluation.receiptSha256,
        actionLog: value.evaluation.actionLog,
      },
      currentArtifactPath: '.omd/build.json',
      productionArtifactPath: 'index.html',
    }), /UNAUTHORIZED_TRUSTED_BROWSER_RECEIPT/);
    assert.equal(existsSync(pointer), false);

    const capture = value.evaluation.receipt.captures[0]!;
    writeFileSync(join(value.root, capture.path), 'swapped');
    assert.throws(() => writeTrustedEvaluationObservation({
      root: value.root,
      writer: value.writer,
      invocation: value.invocation,
      evaluation: value.evaluation,
      currentArtifactPath: '.omd/build.json',
      productionArtifactPath: 'index.html',
    }), /STALE_TRUSTED_BROWSER_CAPTURE/);
    assert.equal(readCurrentObservationV2(value.root), undefined);

    writeFileSync(value.app, 'changed');
    assert.throws(() => writeTrustedEvaluationObservation({
      root: value.root,
      writer: value.writer,
      invocation: value.invocation,
      evaluation: value.evaluation,
      currentArtifactPath: '.omd/build.json',
      productionArtifactPath: 'index.html',
    }), /STALE_TRUSTED_PRODUCTION_REVISION|STALE_TRUSTED_BROWSER_CAPTURE/);
    assert.equal(existsSync(pointer), false);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
