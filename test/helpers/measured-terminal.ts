import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalJson } from '../../core/ref/board-artifacts.ts';
import { canonicalBytes, digest, sha256 } from '../../core/measure/identity.ts';
import { loadMeasurement } from '../../core/measure/files.ts';
import { AXIS_METRICS } from '../../core/measure/citations.ts';
import { MEASURED_DESIGN_QUALITY_AXES } from '../../core/evidence/final-v2-measured-quality.ts';
import { loadReviewPolicy } from '../../core/measure/review-policy.ts';
import { runTrustedBrowserEvaluation } from '../../adapters/trusted-browser-runner.ts';
import { writeTrustedEvaluationObservation } from '../../core/runtime/trusted-evaluation-observation.ts';
import { deriveTrustedDecisionRefs, deriveTrustedEvaluationIdentity, parseTrustedLifecycleManifest } from '../../core/runtime/trusted-evaluation-contract.ts';
import { observationV2Sha256 } from '../../core/runtime/observation.ts';
import { servedProjectTreeSha256 } from '../../core/render/serve.ts';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../../core/route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../../core/route/adaptive-source-contract.ts';
import { signNativeObservation } from '../../core/runtime/self-signed-activation.ts';
import { createAdaptiveSourceSealRoute } from '../../core/source-seal/adaptive-inputs.ts';
import { writeSourceSeal } from '../../core/source-seal/index.ts';
import { adaptiveFinalOmissionMappings } from '../../core/evidence/final-v2-adaptive-contract.ts';
import { validateDecisionGraph } from '../../core/deliberation/contracts.ts';
import { writeBrowserDecisionFixture } from './browser-observation-decision-links.ts';
import { authorizeTestProjectRunPayloads, createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './project-write.ts';
import { captureMeasuredSlopCheckpoint, publishMeasuredSlopReview } from '../../core/slop/measured-review.ts';
import { finalRenderReviewerPacket, FINAL_RENDER_REVIEWER_TASK } from '../../core/runtime/final-render-review.ts';
import { measuredReviewerTask } from '../../core/runtime/trusted-review-profile.ts';
import { measuredLanePacket, type MeasuredLane } from '../../adapters/measured-reviewer-publication.ts';
import { loadTerminalProcess } from '../../core/evidence/final-v2-process.ts';

export const write = (root: string, path: string, value: string | Uint8Array) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
export const receipt = (root: string, path: string, schema: string) => ({ path, schema, sha256: sha256(readFileSync(join(root, path))) });
export function testPurposeAuthority(root: string, purpose: 'ordinary' | 'benchmark' | 'release', request: string) {
  const payload = { schema: 'review-purpose-origin-v1', projectRoot: root, purpose, requestSha256: sha256(request), source: 'host-user-input', observedAt: '2026-09-27T00:00:00Z' };
  const origin = { ...payload, signature: signNativeObservation(root, payload.schema, sha256(canonicalRouteJson(payload))) };
  const bytes = Buffer.from(`${canonicalRouteJson(origin)}\n`), hash = sha256(bytes), path = `.omd/review-purpose-authorities/sha256-${hash}.json`;
  write(root, path, bytes); return { path, sha256: hash };
}
export const measuredTerminalCopy = `# Copy deck
## Sources and fact ledger
| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | user request | Approved confirmation sentence. |
## Audience language
The existing screen uses direct English confirmation copy.
## Voice contract
- Audience: People reading their order receipt
- Language: en
- Register: Direct
- Breath: One fact per sentence
## Truth contract
- Result boundary: local-preview
- Storage boundary: browser-memory
## Surface copy
### Receipt
- Main message: Approved confirmation sentence.
- Supporting fact: Review the recorded order details.
- Next action: Review receipt
- Claim refs: F-001
## Navigation and actions
Review receipt reveals the approved local confirmation text.
## States and recovery
- **Interaction scope**: stateful
- **Primary copy**: Approved confirmation sentence.
- **Recovery copy**: Review the existing receipt again.
- **Primary probe**: .omd/probes/primary.json
- **Recovery probe**: .omd/probes/recovery.json
## Humanize audit
The confirmation states the local result without claiming delivery.
`;
export async function measuredTerminalFixture(t: { after(fn: () => void): void }, options: { zoom?: boolean; purpose?: 'ordinary' | 'benchmark' | 'release'; legacyPurpose?: boolean } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-measured-terminal-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = JSON.parse(readFileSync(new URL('../fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  input.processPolicy = { schema: 'human-design-process-v1', interactionMode: 'interactive', autonomyGrant: null };
  input.strategyDecision.skips.push({ id: 'concept-exploration', reason: 'The approved existing layout is outside this copy-only task.' });
  if (!options.legacyPurpose) { input.reviewPurpose = options.purpose ?? 'ordinary'; input.reviewPurposeAuthority = testPurposeAuthority(root, input.reviewPurpose, input.request); }
  write(root, '.omd/copy-deck.md', measuredTerminalCopy);
  const text = 'Review the recorded quantities and the delivery details shown on your order receipt. Keep this record available while checking the items listed below.';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Order receipt</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font:400 16px/1.5 Arial,sans-serif}main{max-width:1000px;margin:auto;padding:24px}h1{font:700 32px/1.25 Arial,sans-serif;margin:0 0 24px}p{margin:0 0 16px}button{font:700 16px/1.5 Arial,sans-serif;padding:8px 16px;color:#fff;background:#164a35;border:0}button:focus-visible{outline:2px solid #111;outline-offset:2px}
</style><main><h1>Order receipt</h1><button id="review">Review receipt</button><p role="status">Review your order receipt.</p>${Array.from({ length: 7 }, (_, i) => `<p>Item ${i + 1}. ${text}</p>`).join('')}</main><script>document.querySelector('#review').onclick=()=>document.querySelector('[role=status]').textContent='Approved confirmation sentence.';</script></html>`;
  const entry = 'src/copy/final.html'; write(root, entry, html);
  const invocation = publishTestAdaptiveRoute(root, input, 'measured-terminal');
  const writer = createTestProjectWriteAdapter(root, invocation), route = readPersistedRoute(root, invocation);
  const evidence = [{ status: 'user-provided', reference: 'request' }], statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: route.request }] });
  write(root, '.omd/domain-brief.json', canonicalBytes({ schema: 'domain-brief-v1', request: route.request, domain: 'Order confirmation', summary: 'Read an existing order receipt.',
    surfaces: [{ name: 'Receipt', purpose: 'Read the approved confirmation', evidence }], coreObjects: [{ name: 'Order', evidence }], audience: { description: 'People reading an order receipt', evidence },
    referenceQueries: { component: ['order receipt'], craft: ['clear receipt typography'], mood: ['quiet workspace'] }, planning: { businessGoal: statement('Correct the confirmation sentence'), successSignal: statement('Read the approved sentence'), nonGoals: [statement('No behavior or layout changes')] } }));
  if (options.zoom) {
    // A committed machine contract adds both true layout zoom and a narrow viewport. The route
    // still authorizes a typography skip; only the composition claims below are measured.
    write(root, '.omd/composition.md', `## Measurement contract\n\n\`\`\`json\n${JSON.stringify({ schema: 'composition-measurement-contract-v1', frequentAction: '#review', regions: [], colors: [{ role: 'canvas', selector: 'body', property: 'background', value: '#ffffff', token: null }], spacing: null, relationships: [], requiredViews: [{ id: 'narrow-320@1', viewport: { width: 320, height: 844 }, browserZoom: 1 }, { id: 'desktop-zoom@2', viewport: { width: 1280, height: 900 }, browserZoom: 2 }] })}\n\`\`\`\n`);
  }
  writeBrowserDecisionFixture(root);
  const decisionBytes = readFileSync(join(root, '.omd/decision-graph.json')), decisions = validateDecisionGraph(JSON.parse(decisionBytes.toString('utf8'))).value!;
  const identity = deriveTrustedEvaluationIdentity({ sourceContractSha256: route.sourceContractSha256, taskOutcome: route.sourceContract.taskOutcome, evidenceClaims: route.sourceContract.evidenceClaims, allowedPaths: route.allowedPaths, entryPath: entry });
  write(root, '.omd/build.json', canonicalBytes({ schemaVersion: 'omd-build-identity-v1', packageVersion: '1', buildSha256: invocation.current.buildSha256, sourceSkillSha256: invocation.current.loadedSkillSha256 }));
  write(root, '.omd/activation-record.json', canonicalJson(invocation.activation));
  if (!options.zoom) writeSourceSeal(root, invocation);
  const evaluation = await runTrustedBrowserEvaluation({ root, manifest: parseTrustedLifecycleManifest({ schema: 'trusted-lifecycle-manifest-v1', entryPath: entry,
    scripts: identity.requiredOutcomeRefs.map((outcomeRef, i) => ({ outcomeRef, actions: i === 0 ? [{ kind: 'click', selector: '#review' }] : [], assertions: [{ kind: 'visible-text', selector: '[role=status]', text: 'Approved confirmation sentence.' }] })) }),
    binding: { runId: 'measured-run', routeSha256: adaptiveRouteRecordSha256(route), sourceContractSha256: route.sourceContractSha256, activationBuildSha256: invocation.current.buildSha256,
      productionRevisionSha256: servedProjectTreeSha256(root, entry), productionPath: entry, decisionGraphSha256: sha256(decisionBytes), requiredOutcomeRefs: identity.requiredOutcomeRefs,
      confirmedClaimRefs: identity.confirmedClaimRefs, decisionRefs: deriveTrustedDecisionRefs(route.sourceContractSha256, decisions.decisions) },
    artifacts: { write: (path, bytes) => writer.writeContentAddressed(path, bytes) } });
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'product-probe-result', payload: Buffer.from(`${canonicalJson(evaluation.receipt)}\n`) }]);
  const observation = writeTrustedEvaluationObservation({ root, writer, invocation, evaluation, currentArtifactPath: '.omd/build.json', productionArtifactPath: entry, requireDecisionGraph: true });
  const observationSha256s = [observationV2Sha256(observation)], measurements = [...new Map(evaluation.receipt.captures.map(c => [c.measurement!.packet.sha256, c.measurement!.packet])).values()];
  return { root, writer, invocation, route, input, entry, evaluation, observation, observationSha256s, measurements };
}
export function reviewedMeasuredGraph(f: Awaited<ReturnType<typeof measuredTerminalFixture>>) {
  const checkpoint = captureMeasuredSlopCheckpoint(f.root, { schema: 'slop-measured-scope-v2', measurements: f.measurements }, f.writer, f.invocation);
  if (checkpoint.findings.length) throw new Error(`Fixture has native slop findings: ${JSON.stringify(checkpoint.findings.map(f => ({ rule: f.rule, views: f.viewIds })))}`);
  const review = publishMeasuredSlopReview(f.root, { ...checkpoint.reviewInput, summary: 'Inspected the exact retained native order receipt captures.' }, f.writer, f.invocation);
  const route = createAdaptiveSourceSealRoute(f.root, f.invocation);
  const graph = { schema: 'final-evidence-v2-adaptive-omission-graph', activation: receipt(f.root, '.omd/activation-record.json', 'activation-context-v2'), route,
    omissions: adaptiveFinalOmissionMappings().flatMap(([id, routeSkipId]) => { const skip = f.route.strategy.skips.find(s => s.id === routeSkipId); return skip ? [{ id, status: 'skipped', routeSkipId, reason: skip.reason, routeSha256: route.record.sha256, authoritySha256: route.authority.sha256 }] : []; }),
    copy: receipt(f.root, '.omd/copy-deck.md', 'copy-deck-v2'), sourceSeal: receipt(f.root, '.omd/source-seal.json', 'source-seal-v1'), buildIdentity: receipt(f.root, '.omd/build.json', 'omd-build-identity-v1'),
    observations: f.observationSha256s.map(h => receipt(f.root, `.omd/observation-v2/sha256-${h}.json`, 'observation-v2')),
    measuredTerminal: { schema: 'measured-terminal-graph-v1' as const, measurements: f.measurements, reviewPolicy: loadReviewPolicy(f.root, f.invocation), slop: { checkpoint: checkpoint.checkpoint, review }, process: loadTerminalProcess(f.root, f.invocation, f.observationSha256s)!.binding, lanes: {} } };
  return graph;
}
export function signedMeasuredReview(f: Awaited<ReturnType<typeof measuredTerminalFixture>>, lane: MeasuredLane = 'blindLane') {
  const packetBytes = measuredLanePacket(f.root, f.invocation, f.observationSha256s, lane);
  const packet = JSON.parse(packetBytes.toString('utf8')), fixed = packet.outputContract.fixedBindings;
  const native = loadMeasurement(f.root, f.measurements[0]!);
  const handback = { schema: packet.outputContract.schema, lane, ...fixed, verdicts: Object.fromEntries(packet.outputContract.verdictKeys.map((key: string) => [key, 'GREEN'])),
    criticalFloors: Object.fromEntries(packet.outputContract.criticalFloorKeys.map((key: string) => [key, 4])), findings: [],
    ...(lane === 'blindLane' ? { designQuality: { schema: 'design-quality-contract-v2', axes: MEASURED_DESIGN_QUALITY_AXES.map(axis => ({ axis, verdict: 'GREEN', score: 4, crossViewport: 'preserved', criticalFailure: null,
      evidence: native.scope.map(view => ({ observationSha256: f.observationSha256s[0], captureSha256: native.captures.find(c => c.viewId === view.id)!.capture.sha256, viewId: view.id, state: view.state,
        packetSha256: f.measurements[0]!.sha256, measurementIds: native.measurements.filter(m => m.viewIds.includes(view.id) && (AXIS_METRICS[axis] as readonly string[]).includes(m.kind)).map(m => m.id), regionSubjectIds: [], visibleCondition: 'The recorded order details remain legible in this native capture.', userConsequence: 'The reader can review the order and see its current confirmation.' })) })) } } : {}) };
  const keys = generateKeyPairSync('ed25519'), publicKeyPath = join(f.root, '.omd/eye-public.pem'); writeFileSync(publicKeyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
  const role = (index: number, value = handback, exitCode = 0) => {
    const finalMessage = JSON.stringify(value), taskSha256 = sha256(measuredReviewerTask(lane));
    const signed = { schema: 'omd-codex-role-exec-result-v1', role: 'omd-eye', projectRoot: f.root, status: 'completed', exitCode, signal: null, eventCount: 4, finalMessage,
      processPid: 100 + index, roleNonce: `role-${index}`, sessionId: `session-${index}`, configurationSha256: digest('shared-configuration'), taskSha256,
      buildSha256: f.invocation.current.buildSha256, briefSha256: f.invocation.current.briefSha256,
      reviewerEvidence: { schema: 'omd-reviewer-evidence-consumption-v1', evidenceSha256: packet.evidenceSha256, packetSha256: sha256(packetBytes), taskSha256, childPid: 1000 + index, sessionId: `proxy-${index}`, nonce: `proxy-nonce-${index}` } };
    return { schema: 'omd-codex-role-result-v1', agent: 'omd-eye', projectRoot: f.root, result: 'completed', finalMessage, authority: { receipt: signed, signature: sign(null, Buffer.from(canonicalRouteJson(signed)), keys.privateKey).toString('base64') } };
  };
  return { packetBytes, packet, handback, role, context: { projectRoot: f.root, invocation: f.invocation, buildSha256: f.invocation.current.buildSha256, briefSha256: f.invocation.current.briefSha256, publicKeyPath } };
}
