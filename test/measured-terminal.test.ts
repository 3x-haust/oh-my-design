import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { measuredTerminalFixture, reviewedMeasuredGraph, signedMeasuredReview, write, receipt } from './helpers/measured-terminal.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { loadMeasuredQualityContext } from '../core/evidence/final-v2-measurement.ts';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { publishDeterministicProtocol, validateMeasuredTerminal } from '../core/evidence/final-v2-measured-terminal.ts';
import { validateFinalEvidenceV2GraphFiles, validateFinalProductionEvidence } from '../core/evidence/final-v2-graph.ts';
import { checkCompletionPublicationPrerequisites } from '../core/completion/publication.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';
import { digest, canonicalBytes, sha256 } from '../core/measure/identity.ts';
import { captureMeasuredSlopCheckpoint, checkMeasuredSlopReview, publishMeasuredSlopReview } from '../core/slop/measured-review.ts';
import { measureProject } from '../core/measure/index.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';
import { createTestNativePiInvocation, authorizeNativePiPayload } from '../core/runtime/native-pi-run.ts';
import { runNativeFinalReview } from '../core/runtime/native-final-publication.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { publishCompletenessRun, publishTypographyApplicability, renderedIrEvidenceBytes } from '../core/completion/evidence.ts';
import { publishFinalEvidenceV2 } from '../core/evidence/final-v2.ts';
import { checkTerminalCompletion } from '../core/completion/preflight.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';

test('trusted v2 captures initial and outcome pixels in one immutable native measurement transaction', async t => {
  const f = await measuredTerminalFixture(t);
  assert.equal(f.evaluation.receipt.schema, 'trusted-browser-receipt-v2');
  const packet = loadMeasurement(f.root, f.measurements[0]!);
  assert.equal(Reflect.set(packet.summary, 'deterministicVerdict', 'RED'), false);
  assert.throws(() => packet.scope.push(packet.scope[0]!), TypeError);
  assert.equal(packet.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings));
  assert.ok(packet.scope.some(v => v.viewport.width === 390));
  assert.ok(packet.scope.every(v => v.browserZoom === 1));
  const context = loadMeasuredQualityContext(f.root, f.invocation, f.measurements, f.observationSha256s);
  assert.equal(context.bindings.length, packet.scope.length);
  for (const capture of f.evaluation.receipt.captures) {
    const retained = packet.captures.find(c => c.viewId === capture.measurement!.viewId)!;
    assert.deepEqual(readFileSync(join(f.root, capture.path)), readFileSync(join(f.root, retained.capture.path)));
    assert.equal(capture.measurement!.stateRecipeSha256, packet.scope.find(v => v.id === retained.viewId)!.stateRecipeSha256);
  }
  assert.equal(packet.scope.filter(v => v.state === 'initial').length, 2);
  assert.notEqual(packet.captures[0]!.capture.sha256, packet.captures[1]!.capture.sha256);
  const malformed = structuredClone(f.evaluation.receipt); Reflect.deleteProperty(malformed.captures[0]!, 'measurement');
  assert.throws(() => parseTrustedBrowserReceipt(malformed), /MALFORMED/);
  assert.throws(() => loadMeasuredQualityContext(f.root, f.invocation, [], f.observationSha256s), /receipts required/);
  const supplemental = await measureProject({ root: f.root, entry: f.entry, writer: f.writer, invocation: f.invocation });
  assert.equal(existsSync(join(f.root, '.omd/slop/latest.json')), false);
  const starter = { schema: 'slop-measured-scope-v2' as const, measurements: [] };
  assert.throws(() => captureMeasuredSlopCheckpoint(f.root, starter,
    f.writer, f.invocation), /current measurement receipts required/);
  assert.equal(existsSync(join(f.root, '.omd/slop/latest.json')), false);
  const scope = { ...starter, measurements: [...f.measurements, supplemental.packet] };
  const checkpoint = captureMeasuredSlopCheckpoint(f.root, scope, f.writer, f.invocation);
  assert.deepEqual(checkpoint.findings, []);
  publishMeasuredSlopReview(f.root, { ...checkpoint.reviewInput, summary: 'Reviewed both exact native capture transactions, including their shared viewport IDs.' }, f.writer, f.invocation);
  assert.deepEqual(checkMeasuredSlopReview(f.root).measurements, scope.measurements);
});

test('native completion sends passing measured execution to its slop owner before independent review', async t => {
  const f = await measuredTerminalFixture(t);
  const source = readFileSync(join(f.root, f.entry));
  const work = nativeCompletionWork(f.root, f.invocation);
  assert.equal(work.action, 'author-browser-plan');
  assert.equal(work.owner, 'coordinator');
  assert.equal(work.next, 'omd schema trusted-lifecycle-manifest --json');
  assert.deepEqual(readFileSync(join(f.root, f.entry)), source);
  assert.equal(existsSync(join(f.root, '.omd/slop/latest.json')), false);
  reviewedMeasuredGraph(f);
  assert.equal(nativeCompletionWork(f.root, f.invocation).action, 'author-browser-plan');
  assert.deepEqual(readFileSync(join(f.root, f.entry)), source);
});

test('signed all-green measured publication uses policy quorum, native protocol, exact slop and replayed graph', async t => {
  const f = await measuredTerminalFixture(t), graph = reviewedMeasuredGraph(f), review = signedMeasuredReview(f);
  const projection = JSON.stringify(review.packet.evidence.measurementProjection);
  assert.ok(!projection.includes('locator') && !projection.includes('#review') && !projection.includes('src/copy'));
  assert.equal(review.packet.outputContract.designQuality.axes.length, 11);
  assert.equal(review.packet.outputContract.fixedBindings.reviewPolicySha256, digest(graph.measuredTerminal.reviewPolicy));
  const input = { schema: 'adaptive-final-review-publication-v1', laneSchema: 'measured-blind-review-v1', roleResults: [review.role(1)] };
  const published = buildFinalReviewerPublication(input, review.context);
  const lane = JSON.parse(published.lane.bytes.toString('utf8'));
  assert.deepEqual(lane.quorum, { required: 1, passed: 1 });
  assert.throws(() => buildFinalReviewerPublication({ ...input, roleResults: [review.role(1, review.handback, 1)] }, review.context), /did not finish successfully/);
  assert.throws(() => buildFinalReviewerPublication({ ...input, roleResults: [review.role(1), review.role(2)] }, review.context), /quorum/);
  const lower = structuredClone(review.handback); lower.criticalFloors.composition = 3;
  assert.throws(() => buildFinalReviewerPublication({ ...input, roleResults: [review.role(1, lower)] }, review.context), /composition/);
  const uncited = structuredClone(review.handback); uncited.designQuality.axes[0]!.evidence[0]!.measurementIds = [];
  assert.throws(() => buildFinalReviewerPublication({ ...input, roleResults: [review.role(1, uncited)] }, review.context), /prose instead of measurements/);
  const stale = structuredClone(review.handback); stale.reviewPolicySha256 = 'a'.repeat(64);
  assert.throws(() => buildFinalReviewerPublication({ ...input, roleResults: [review.role(1, stale)] }, review.context), /binding changed/);
  const wrongProfile = structuredClone(review.handback); wrongProfile.reviewProfile = { ...wrongProfile.reviewProfile, sha256: '0'.repeat(64) };
  assert.throws(() => buildFinalReviewerPublication({ ...input, roleResults: [review.role(1, wrongProfile)] }, review.context), /binding changed: reviewProfile/);
  assert.throws(() => publishMeasuredSlopReview(f.root, { schema: 'slop-review-v1' }, f.writer, f.invocation), /exact fields/);
  const protocol = publishDeterministicProtocol(f.root, graph, f.writer, f.invocation);
  const protocolValue = JSON.parse(readFileSync(join(f.root, protocol.path), 'utf8'));
  for (const key of ['processPid', 'sessionId', 'model', 'verdict', 'passed']) assert.equal(key in protocolValue, false);
  for (const artifact of [...published.executions, published.lane]) {
    authorizeNativePiPayload(f.invocation, f.root, 'final-reviewer-lane', artifact.bytes);
    f.writer.writeContentAddressed(artifact.path, artifact.bytes);
  }
  const terminal = { ...graph, measuredTerminal: { ...graph.measuredTerminal, deterministicProtocol: protocol, lanes: { blindLane: { path: published.lane.path, sha256: published.lane.sha256 } } } };
  validateMeasuredTerminal(f.root, terminal, f.invocation);
  const checked = validateFinalEvidenceV2GraphFiles(f.root, terminal, nodeStableProjectFileSystem(), f.invocation);
  assert.equal(checked.graph.measuredTerminal?.measurements[0]!.sha256, f.measurements[0]!.sha256);
  assert.equal(checkMeasuredSlopReview(f.root, terminal.measuredTerminal).scopeBinding, 'trusted-measured-packets-and-subjects');
  const { deterministicProtocol: _protocol, ...withoutProtocol } = terminal.measuredTerminal;
  assert.throws(() => validateMeasuredTerminal(f.root, { ...terminal, measuredTerminal: withoutProtocol }, f.invocation), /protocol receipt required/);
  assert.throws(() => validateMeasuredTerminal(f.root, { ...terminal, measuredTerminal: { ...terminal.measuredTerminal, lanes: { ...terminal.measuredTerminal.lanes, protocolLane: terminal.measuredTerminal.lanes.blindLane } } }, f.invocation), /unselected lane/);
  const { measuredTerminal: _measured, ...legacy } = graph;
  assert.throws(() => checkCompletionPublicationPrerequisites(f.root, { graph: legacy }, f.invocation), /requires immutable measured terminal/);
  assert.equal(existsSync(join(f.root, '.omd/final-evidence-v2.json')), false);
  const altered = { ...protocolValue, productionRootHash: 'b'.repeat(64) }, bytes = canonicalBytes(altered), hash = sha256(bytes), path = `.omd/final-review/protocol/sha256-${hash}.json`;
  f.writer.writeContentAddressed(path, bytes);
  assert.throws(() => validateMeasuredTerminal(f.root, { ...terminal, measuredTerminal: { ...terminal.measuredTerminal, deterministicProtocol: { path, sha256: hash } } }, f.invocation), /forged or stale/);
  writeFileSync(join(f.root, f.entry), `${readFileSync(join(f.root, f.entry), 'utf8')}\n<!-- changed -->`);
  assert.throws(() => validateMeasuredTerminal(f.root, terminal, f.invocation), /source changed|build changed/);
});

test('a replacement Pi invocation cannot consume another native run measured review', { timeout: 180_000 }, async t => {
  const f = await measuredTerminalFixture(t); reviewedMeasuredGraph(f);
  const nodePath = realpathSync(process.execPath), cliPath = fileURLToPath(new URL('fixtures/measured-pi-reviewer-rpc.mjs', import.meta.url));
  const host = { nodePath, nodeSha256: sha256(readFileSync(nodePath)), cliPath, cliSha256: sha256(readFileSync(cliPath)), provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'measured-parent' };
  const invocation = createTestNativePiInvocation({ root: f.root, host, current: f.invocation.current });
  authorizeNativePiPayload(invocation, f.root, 'product-probe-result', Buffer.from(`${canonicalJson(f.evaluation.receipt)}\n`));
  await assert.rejects(
    () => runNativeFinalReview({ root: f.root, invocation, signal: t.signal }),
    /matching native host policy|ROUTE_AUTHORITY_REQUIRED/,
  );
  assert.equal(existsSync(join(f.root, '.omd/final-review/native-current.json')), false);
});

test('ordinary measured terminal selects one isolated blind review lane', async t => {
  const f = await measuredTerminalFixture(t), graph = reviewedMeasuredGraph(f);
  assert.deepEqual(graph.measuredTerminal.reviewPolicy.lanes, { blind: 1, fidelity: 0, protocol: 0 });
  validateFinalProductionEvidence(f.root, graph, nodeStableProjectFileSystem(), f.invocation);
  const review = signedMeasuredReview(f);
  const publication = buildFinalReviewerPublication({
    schema: 'adaptive-final-review-publication-v1',
    laneSchema: review.packet.outputContract.laneSchema,
    roleResults: [review.role(1)],
  }, review.context);
  assert.equal(JSON.parse(publication.lane.bytes.toString('utf8')).lane, 'blindLane');
});
