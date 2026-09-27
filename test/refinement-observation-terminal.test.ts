import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { measuredTerminalFixture, write } from './helpers/measured-terminal.ts';
import { authorizeTestProjectRunPayloads } from './helpers/project-write.ts';
import { stageProductionRepair, applyProductionRepair, productionRepairReviewBytes } from '../core/runtime/production-repair.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { sha256 } from '../core/measure/identity.ts';
import { currentRefinementBinding, recordTrustedRefinementObservation } from '../core/runtime/trusted-refinement.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';
import { runTrustedBrowserEvaluation } from '../adapters/trusted-browser-runner.ts';
import { writeTrustedEvaluationObservation } from '../core/runtime/trusted-evaluation-observation.ts';
import { observationV2Sha256 } from '../core/runtime/observation.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';

function mirrorHash(root: string): string {
  const tree: Record<string, unknown>[] = [{ path: '.', kind: 'directory', mode: lstatSync(root).mode & 0o7777 }];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), stat = lstatSync(path), item = { path: relative(root, path), mode: stat.mode & 0o7777 };
      if (stat.isDirectory()) { tree.push({ ...item, kind: 'directory' }); visit(path); }
      else tree.push({ ...item, kind: 'file', sha256: sha256(readFileSync(path)) });
    }
  };
  visit(root); return sha256(canonicalJson(tree));
}

test('actual committed repair and native post-render observation advance the durable ledger; removing it cannot bypass terminal checking', { timeout: 180_000 }, async t => {
  const f = await measuredTerminalFixture(t), mirror = realpathSync(mkdtempSync(join(tmpdir(), 'omd-refinement-native-mirror-')));
  t.after(() => rmSync(mirror, { recursive: true, force: true }));
  const before = readFileSync(join(f.root, f.entry)), after = Buffer.concat([before, Buffer.from('\n<!-- recorded source revision -->\n')]);
  write(mirror, f.entry, after); chmodSync(join(mirror, f.entry), lstatSync(join(f.root, f.entry)).mode & 0o777);
  const pointer = readFileSync(join(f.root, '.omd/observation-v2.json')), retentionPath = join(f.root, '.omd/observation-v2-retention.json');
  const retention = existsSync(retentionPath) ? readFileSync(retentionPath) : null;
  // Fixture owner/reviewer transport authorizes this exact real source edit. Capture and ledger
  // production are not mocked and must still reject forged or missing native evidence.
  const review = { schema: 'production-repair-review-v1' as const, observationPointerSha256: sha256(pointer), retentionPointerSha256: retention ? sha256(retention) : null,
    beforeSha256: sha256(before), afterSha256: sha256(after), suggestedPaths: [f.entry], findingIds: ['fixture-source-revision'] };
  const stat = lstatSync(mirror), finalHash = mirrorHash(mirror);
  const owner = Buffer.from(`${canonicalJson({ schema: 'omd-production-owner-result-v1', owner: 'omd-hand', projectRoot: f.root,
    host: 'codex', transport: 'codex-exec-stdio-jsonl', mode: 'repair', result: 'completed', taskSha256: sha256('fixture-edit'), rolePromptSha256: sha256('fixture-owner'),
    modelArgumentOmitted: true, modelReasoningEffort: 'medium', configurationSha256: sha256('fixture-config'), attempts: [{}], sourceChanges: [], receiptPath: `${mirror}.owner-receipt.json`,
    repair: { mirrorRoot: mirror, mirrorDevice: String(stat.dev), mirrorInode: String(stat.ino), mirrorBaselineSha256: sha256(before), mirrorFinalSha256: finalHash,
      observationPointerSha256: sha256(pointer), observationSha256: f.observationSha256s[0], changedPaths: [f.entry] } })}\n`);
  authorizeTestProjectRunPayloads(f.root, f.invocation, [{ purpose: 'production-owner-repair', payload: owner }, { purpose: 'final-reviewer-lane', payload: productionRepairReviewBytes(review) }]);
  const staged = stageProductionRepair({ root: f.root, invocation: f.invocation, review, mirrorRoot: mirror, ownerReceipt: owner });
  assert.equal(applyProductionRepair({ root: f.root, invocation: f.invocation, writer: f.writer, staged }).status, 'committed');
  writeSourceSeal(f.root, f.invocation);
  const old = f.evaluation.receipt, outcomeRefs = old.outcomeResults.map(o => o.outcomeRef);
  const evaluation = await runTrustedBrowserEvaluation({ root: f.root, manifest: parseTrustedLifecycleManifest({ schema: 'trusted-lifecycle-manifest-v1', entryPath: f.entry,
    scripts: outcomeRefs.map((outcomeRef, i) => ({ outcomeRef, actions: i === 0 ? [{ kind: 'click', selector: '#review' }] : [], assertions: [{ kind: 'visible-text', selector: '[role=status]', text: 'Approved confirmation sentence.' }] })) }),
    binding: { runId: 'native-after-repair', routeSha256: old.routeSha256, sourceContractSha256: old.sourceContractSha256, activationBuildSha256: old.activationBuildSha256,
      productionRevisionSha256: servedProjectTreeSha256(f.root, f.entry), productionPath: f.entry, decisionGraphSha256: old.decisionGraphSha256,
      requiredOutcomeRefs: outcomeRefs, confirmedClaimRefs: old.confirmedClaimRefs, decisionRefs: old.decisionRefs },
    artifacts: { write: (path, bytes) => f.writer.writeContentAddressed(path, bytes) } });
  authorizeTestProjectRunPayloads(f.root, f.invocation, [{ purpose: 'product-probe-result', payload: Buffer.from(`${canonicalJson(evaluation.receipt)}\n`) }]);
  const observed = writeTrustedEvaluationObservation({ root: f.root, writer: f.writer, invocation: f.invocation, evaluation, currentArtifactPath: '.omd/build.json', productionArtifactPath: f.entry, requireDecisionGraph: true });
  assert.equal(observed.predecessorSha256, f.observationSha256s[0]);
  const measurements = [...new Map(evaluation.receipt.captures.map(c => [c.measurement!.packet.sha256, c.measurement!.packet])).values()];
  const binding = currentRefinementBinding(f.root, f.invocation, [observationV2Sha256(observed)])!;
  const record = JSON.parse(readFileSync(join(f.root, binding.head.path), 'utf8'));
  assert.equal(record.measurement.sha256, measurements[0]!.sha256);
  assert.equal(record.outcome.requiredEvidence, true);
  assert.equal(recordTrustedRefinementObservation(f.root, observed, measurements, f.writer, f.invocation)!.recorded, false);
  const saved = readFileSync(join(f.root, binding.pointer.path)); rmSync(join(f.root, binding.pointer.path));
  assert.throws(() => currentRefinementBinding(f.root, f.invocation, [observationV2Sha256(observed)]), /post-repair refinement observation is missing/);
  write(f.root, binding.pointer.path, saved);
  assert.equal(currentRefinementBinding(f.root, f.invocation, [observationV2Sha256(observed)])!.head.sha256, binding.head.sha256);
});
