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
import { authorizeTestProjectRunPayloads } from './helpers/project-write.ts';
import { digest, canonicalBytes, sha256 } from '../core/measure/identity.ts';
import { captureMeasuredSlopCheckpoint, checkMeasuredSlopReview, publishMeasuredSlopReview } from '../core/slop/measured-review.ts';
import { measureProject } from '../core/measure/index.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';
import { createTestNativePiInvocation, authorizeNativePiPayload } from '../core/runtime/native-pi-run.ts';
import { runNativeFinalReview, checkNativeFinalReview } from '../core/runtime/native-final-publication.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { publishCompletenessRun, publishTypographyApplicability, renderedIrEvidenceBytes } from '../core/completion/evidence.ts';
import { publishFinalEvidenceV2 } from '../core/evidence/final-v2.ts';
import { checkTerminalCompletion } from '../core/completion/preflight.ts';
import { verifySignedPiEyeRoleResult } from '../core/runtime/pi-role-receipt.ts';

test('trusted v2 captures initial and outcome pixels in one immutable native measurement transaction', async t => {
  const f = await measuredTerminalFixture(t, { zoom: true });
  assert.equal(f.evaluation.receipt.schema, 'trusted-browser-receipt-v2');
  const packet = loadMeasurement(f.root, f.measurements[0]!);
  assert.equal(Reflect.set(packet.summary, 'deterministicVerdict', 'RED'), false);
  assert.throws(() => packet.scope.push(packet.scope[0]!), TypeError);
  assert.equal(packet.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings));
  assert.ok(packet.scope.some(v => v.viewport.width === 320));
  assert.ok(packet.scope.some(v => v.browserZoom === 2));
  const context = loadMeasuredQualityContext(f.root, f.invocation, f.measurements, f.observationSha256s);
  assert.equal(context.bindings.length, packet.scope.length);
  for (const capture of f.evaluation.receipt.captures) {
    const retained = packet.captures.find(c => c.viewId === capture.measurement!.viewId)!;
    assert.deepEqual(readFileSync(join(f.root, capture.path)), readFileSync(join(f.root, retained.capture.path)));
    assert.equal(capture.measurement!.stateRecipeSha256, packet.scope.find(v => v.id === retained.viewId)!.stateRecipeSha256);
    if (capture.measurement!.browserZoom === 2) assert.equal(capture.measurement!.layoutViewport.width, capture.measurement!.viewport.width / 2);
  }
  assert.equal(packet.scope.filter(v => v.state === 'initial').length, 4);
  assert.notEqual(packet.captures[0]!.capture.sha256, packet.captures[1]!.capture.sha256);
  const malformed = structuredClone(f.evaluation.receipt); Reflect.deleteProperty(malformed.captures[0]!, 'measurement');
  assert.throws(() => parseTrustedBrowserReceipt(malformed), /MALFORMED/);
  assert.throws(() => loadMeasuredQualityContext(f.root, f.invocation, [], f.observationSha256s), /receipts required/);
  const supplemental = await measureProject({ root: f.root, entry: f.entry, writer: f.writer, invocation: f.invocation });
  const scope = { schema: 'slop-measured-scope-v2', measurements: [...f.measurements, supplemental.packet] };
  const checkpoint = captureMeasuredSlopCheckpoint(f.root, scope, f.writer, f.invocation);
  assert.deepEqual(checkpoint.findings, []);
  publishMeasuredSlopReview(f.root, { ...checkpoint.reviewInput, summary: 'Reviewed both exact native capture transactions, including their shared viewport IDs.' }, f.writer, f.invocation);
  assert.deepEqual(checkMeasuredSlopReview(f.root).measurements, scope.measurements);
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
    authorizeTestProjectRunPayloads(f.root, f.invocation, [{ purpose: 'final-reviewer-lane', payload: artifact.bytes }]);
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
  const native = loadMeasurement(f.root, f.measurements[0]!), state = native.scope.find(v => v.state !== 'initial')!;
  const captured = native.captures.find(c => c.viewId === state.id)!;
  const raw = JSON.parse(readFileSync(join(f.root, captured.ir.path), 'utf8'));
  // The host's display-URL projection preserves every retained native node/measurement value.
  raw.meta.url = new URL(state.route, 'http://127.0.0.1').href;
  write(f.root, '.omd/functional-requirements.json', canonicalBytes({ schema: 'functional-requirements-v2', requirements: [{ id: 'R-1', kind: 'content', statement: 'The approved confirmation is visible.', label: 'Approved confirmation sentence.' }], evidence: { states: [state.state], viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }] } }));
  authorizeTestProjectRunPayloads(f.root, f.invocation, [{ purpose: 'product-probe-result', payload: renderedIrEvidenceBytes(raw) }]);
  const typographyApplicability = publishTypographyApplicability(f.root, raw, f.invocation);
  publishCompletenessRun(f.root, { schema: 'functional-completeness-run-input-v2', requirements: receipt(f.root, '.omd/functional-requirements.json', 'functional-requirements-v2'), buildIdentity: graph.buildIdentity,
    sourceSeal: graph.sourceSeal, typographyApplicability, testedUrl: raw.meta.url, testedState: state.state, viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }], observations: graph.observations, findings: [] }, f.invocation);
  const manifest = { schema: 'final-evidence-v2', motionDecision: 'none', claimPublication: f.route.sourceContract.evidenceClaims, graph: terminal };
  authorizeTestProjectRunPayloads(f.root, f.invocation, [{ purpose: 'final-evidence-manifest', payload: Buffer.from(`${canonicalRouteJson({ ...manifest, graphRootHash: checked.rootHash })}\n`) }]);
  publishFinalEvidenceV2(f.root, manifest, f.invocation);
  assert.equal(checkTerminalCompletion(f.root, f.invocation).final.graph.measuredTerminal?.measurements[0]!.sha256, f.measurements[0]!.sha256);
  const altered = { ...protocolValue, productionRootHash: 'b'.repeat(64) }, bytes = canonicalBytes(altered), hash = sha256(bytes), path = `.omd/final-review/protocol/sha256-${hash}.json`;
  f.writer.writeContentAddressed(path, bytes);
  assert.throws(() => validateMeasuredTerminal(f.root, { ...terminal, measuredTerminal: { ...terminal.measuredTerminal, deterministicProtocol: { path, sha256: hash } } }, f.invocation), /forged or stale/);
  writeFileSync(join(f.root, f.entry), `${readFileSync(join(f.root, f.entry), 'utf8')}\n<!-- changed -->`);
  assert.throws(() => validateMeasuredTerminal(f.root, terminal, f.invocation), /source changed|build changed/);
});

test('actual isolated Pi fixture consumes native measured images and signs one policy-selected blind review', { timeout: 180_000 }, async t => {
  const f = await measuredTerminalFixture(t); reviewedMeasuredGraph(f);
  const nodePath = realpathSync(process.execPath), cliPath = fileURLToPath(new URL('fixtures/measured-pi-reviewer-rpc.mjs', import.meta.url));
  const host = { nodePath, nodeSha256: sha256(readFileSync(nodePath)), cliPath, cliSha256: sha256(readFileSync(cliPath)), provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'measured-parent' };
  const invocation = createTestNativePiInvocation({ root: f.root, host, current: f.invocation.current });
  authorizeNativePiPayload(invocation, f.root, 'product-probe-result', Buffer.from(`${canonicalJson(f.evaluation.receipt)}\n`));
  const result = await runNativeFinalReview({ root: f.root, invocation, signal: t.signal });
  assert.deepEqual(Object.keys(result.lanes), ['blindLane']);
  assert.equal(result.executions.length, 1);
  assert.equal(checkNativeFinalReview({ root: f.root, invocation }).ok, true);
  const pointer = JSON.parse(readFileSync(join(f.root, result.pointer), 'utf8'));
  assert.equal(pointer.schema, 'native-pi-final-review-v2');
  const attempt = JSON.parse(readFileSync(join(f.root, pointer.attempt.path), 'utf8')), roles = attempt.results[0].roleResults;
  assert.equal(roles.length, 1); assert.notEqual(roles[0]!.authority.receipt.processPid, process.pid);
  assert.equal(verifySignedPiEyeRoleResult(roles[0], f.root).receipt.schema, 'omd-pi-role-exec-result-v2');
  assert.notEqual(roles[0]!.authority.receipt.reviewerEvidence.childPid, roles[0]!.authority.receipt.processPid);
  assert.notEqual(roles[0]!.authority.receipt.reviewerEvidence.sessionId, roles[0]!.authority.receipt.sessionId);
  assert.notEqual(roles[0]!.authority.receipt.reviewerEvidence.nonce, roles[0]!.authority.receipt.roleNonce);
  for (const [proofKey, roleKey] of [['sessionId', 'sessionId'], ['nonce', 'roleNonce']] as const) {
    const reused = structuredClone(roles[0]);
    reused.authority.receipt.reviewerEvidence[proofKey] = reused.authority.receipt[roleKey];
    assert.throws(() => verifySignedPiEyeRoleResult(reused, f.root), /role-authority/);
  }
  assert.equal(JSON.parse(readFileSync(join(f.root, result.lanes.blindLane!.path), 'utf8')).designQuality.schema, 'design-quality-contract-v2');
});

test('measured terminal isolates reviewer and consumption identities across all lanes', { timeout: 600_000 }, async t => {
  const f = await measuredTerminalFixture(t, { purpose: 'benchmark' }), graph = reviewedMeasuredGraph(f);
  assert.deepEqual(graph.measuredTerminal.reviewPolicy.lanes, { blind: 2, fidelity: 2, protocol: 2 });
  // Production-only validation must accept this draft without protocol or reviewer receipts.
  // Recursing into terminal validation would reject it (or recurse indefinitely).
  validateFinalProductionEvidence(f.root, graph, nodeStableProjectFileSystem(), f.invocation);
  const protocol = publishDeterministicProtocol(f.root, graph, f.writer, f.invocation);
  const laneNames = ['blindLane', 'fidelityLane', 'protocolLane'] as const;
  const persist = (artifact: { path: string; bytes: Buffer }) => {
    authorizeTestProjectRunPayloads(f.root, f.invocation, [{ purpose: 'final-reviewer-lane', payload: artifact.bytes }]);
    f.writer.writeContentAddressed(artifact.path, artifact.bytes);
  };
  const publications = laneNames.map((lane, index) => {
    const review = signedMeasuredReview(f, lane);
    const publication = buildFinalReviewerPublication({ schema: 'adaptive-final-review-publication-v1', laneSchema: review.packet.outputContract.laneSchema,
      roleResults: [review.role(index * 2 + 1), review.role(index * 2 + 2)] }, review.context);
    for (const artifact of [...publication.executions, ...publication.artifacts ?? [], publication.lane]) persist(artifact);
    return { lane, publication, laneRecord: JSON.parse(publication.lane.bytes.toString('utf8')),
      executions: publication.executions.map(e => JSON.parse(e.bytes.toString('utf8'))) };
  });
  const terminal = { ...graph, measuredTerminal: { ...graph.measuredTerminal, deterministicProtocol: protocol,
    lanes: Object.fromEntries(publications.map(p => [p.lane, { path: p.publication.lane.path, sha256: p.publication.lane.sha256 }])) } };
  assert.equal(new Set(publications.flatMap(p => p.executions.map(e => e.configurationSha256))).size, 1);
  validateMeasuredTerminal(f.root, terminal, f.invocation);
  const store = (directory: 'executions' | 'lanes', value: unknown) => {
    const bytes = canonicalBytes(value), hash = sha256(bytes), path = `.omd/final-review/${directory}/sha256-${hash}.json`;
    persist({ path, bytes }); return { path, sha256: hash };
  };
  const withIdentity = (laneIndex: number, key: 'processPid' | 'sessionId' | 'nonce', value: unknown) => {
    const original = publications[laneIndex]!, execution = structuredClone(original.executions[0]);
    Reflect.set(execution, key, value);
    if (key === 'sessionId') execution.reviewerId = `omd-eye-${sha256(execution.sessionId).slice(0, 16)}`;
    // Reauthorize exact mutated bytes as a host-publication fixture. Refusal must come from
    // terminal identity checks, not stale receipt hashes or a missing authority mock.
    const changed = store('executions', execution), lane = structuredClone(original.laneRecord);
    lane.executionReceipts[0] = changed;
    return { ...terminal, measuredTerminal: { ...terminal.measuredTerminal, lanes: { ...terminal.measuredTerminal.lanes, [original.lane]: store('lanes', lane) } } };
  };
  for (const key of ['processPid', 'sessionId', 'nonce'] as const) {
    for (let earlier = 0; earlier < laneNames.length; earlier++) for (let later = earlier + 1; later < laneNames.length; later++) {
      await t.test(`${key}: reviewer reuse between ${laneNames[earlier]} and ${laneNames[later]}`, () => {
        const reused = withIdentity(later, key, publications[earlier]!.executions[0][key]);
        assert.throws(() => validateMeasuredTerminal(f.root, reused, f.invocation), /reviewer execution is reused/);
      });
    }
    for (let reviewer = 0; reviewer < laneNames.length; reviewer++) for (let consumer = 0; consumer < laneNames.length; consumer++) {
      await t.test(`${key}: ${laneNames[reviewer]} reviewer overlaps ${laneNames[consumer]} consumption`, () => {
        const reused = withIdentity(reviewer, key, publications[consumer]!.executions[1].evidenceConsumption[key]);
        assert.throws(() => validateMeasuredTerminal(f.root, reused, f.invocation), /reviewer and evidence-consumption identities overlap/);
      });
    }
  }
  for (const key of ['sessionId', 'nonce'] as const) await t.test(`${key}: reviewer overlaps its own consumption`, () => {
    const reused = withIdentity(0, key, publications[0]!.executions[0].evidenceConsumption[key]);
    assert.throws(() => validateMeasuredTerminal(f.root, reused, f.invocation), /reviewer and evidence-consumption identities overlap/);
  });
});
