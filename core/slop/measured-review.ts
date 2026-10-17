import { fileURLToPath } from 'node:url';
import { normalize } from '../ir/normalize.ts';
import { check, loadRules } from '../rules/engine.ts';
import { MeasurementIndex, validateSlopMeasurementDecision, type SlopMeasurementDecision } from '../measure/citations.ts';
import type { Receipt, MeasuredIr, MetricKind, Measurement, VisualMeasurement } from '../measure/types.ts';
import { loadMeasurement } from '../measure/files.ts';
import { readArtifact, sourceDigest, loadContracts } from '../measure/inputs.ts';
import { canonicalBytes, digest, sha256 } from '../measure/identity.ts';
import * as v from '../measure/validation.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { acquireProjectMutationLock, requireProjectWriteAdapterForInvocation, replaceProjectFileAtomically, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import { validateSourceBoundProofCurrentness } from '../composition-contract/source-currentness.ts';
import { scanSlopSource } from './index.ts';
import { checkSlopReview } from './review.ts';
import { historicalCheckpoint, inheritedSlopFindings, measuredSlopScope, type Finding, type Checkpoint, type Review } from './measured-history.ts';
import { projectPathEntryExists } from '../runtime/project-path-entry.ts';

const pointerPath = '.omd/slop/latest.json';
const rulesRoot = fileURLToPath(new URL('../rules/builtin', import.meta.url));
const renderRuleCache = new Map<string, { warnings: ReturnType<typeof check>; applicable: string[] }>();
function renderRuleInventory(raw: MeasuredIr, rules: ReturnType<typeof loadRules>, irSha256: string, rulesSha256: string) {
  const key = `${irSha256}:${rulesSha256}`;
  const cached = renderRuleCache.get(key);
  if (cached) return cached;
  // Builtins consume the rendered IR, not its full measurement provenance. Keep that
  // authenticated payload in the packet/measurement paths, outside timed rule clones.
  const { measurement: _measurement, ...ruleInput } = raw;
  const ir = normalize(ruleInput), result = { warnings: check(ir, rules), applicable: check(ir, rules.map(rule => ({ ...rule, assert: 'false' }))).map(f => f.id) };
  // Reuse only identical authenticated IR and exact current rule bytes. Source scans, packet
  // attestation, source/build/contracts and rule bytes are still reread on every validation.
  if (renderRuleCache.size >= 64) renderRuleCache.delete(renderRuleCache.keys().next().value!);
  renderRuleCache.set(key, result); return result;
}
type Pointer = { schema: 'slop-review-pointer-v2'; checkpoint: Receipt; review: Receipt | null };
const fail = (message: string): never => v.fail(`SLOP_REVIEW_REQUIRED: ${message}`);
function saved<T>(root: string, receipt: Receipt): T {
  v.receipt(receipt);
  if (!/^\.omd\/slop\/(?:checkpoints|reviews)\/[a-f0-9]{64}\.json$/.test(receipt.path) || !receipt.path.endsWith(`/${receipt.sha256}.json`)) fail('invalid measured slop receipt');
  const bytes = readArtifact(root, receipt.path);
  if (sha256(bytes) !== receipt.sha256) fail('measured slop bytes changed');
  return JSON.parse(bytes.toString('utf8')) as T;
}
function pointerValue(root: string): unknown | null {
  if (!projectPathEntryExists(root, pointerPath)) return null;
  try {
    return JSON.parse(readArtifact(root, pointerPath).toString('utf8'));
  } catch {
    return fail('measured slop pointer is unreadable');
  }
}
function currentPointer(root: string): Pointer | null {
  const value = pointerValue(root);
  if (value === null) return null;
  v.object({ schema: v.enumeration('slop-review-pointer-v2'), checkpoint: v.receipt, review: v.nullable(v.receipt) })(value);
  return value as Pointer;
}
export function hasMeasuredSlopReview(root: string): boolean {
  const value = pointerValue(root);
  if (value === null) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('measured slop pointer is invalid');
  const schema = (value as { schema?: unknown }).schema;
  if (schema === 'slop-review-pointer-v2') { currentPointer(root); return true; }
  if (schema === 'slop-review-pointer-v1') {
    v.object({ schema: v.enumeration('slop-review-pointer-v1'), checkpoint: v.receipt, review: v.nullable(v.receipt) })(value);
    return false;
  }
  return fail('measured slop pointer schema is invalid');
}
/** Current repair evidence, not a completion or review approval. */
export function measuredSlopRepairInput(root: string) {
  const raw = pointerValue(root);
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('measured slop pointer is invalid');
  const value = raw as Record<string, unknown>;
  if (value.schema === 'slop-review-pointer-v1') {
    v.object({ schema: v.enumeration('slop-review-pointer-v1'), checkpoint: v.receipt,
      review: v.nullable(v.receipt) })(value);
    return null;
  }
  const latest = currentPointer(root) ?? fail('measured checkpoint required');
  const checkpoint = saved<Checkpoint>(root, latest.checkpoint);
  const actual = current(root, checkpoint);
  const unresolved = inheritedSlopFindings(root, {
    checkpoint: latest.checkpoint, review: latest.review,
  }).findings;
  // Repair context preserves every obligation and observed target, not the raw
  // metric matrices already verified by current(). Review still loads those
  // immutable packets through MeasurementIndex; this projection is no approval.
  return {
    lineage: { checkpoint: latest.checkpoint, review: latest.review,
      sourceSha256: checkpoint.sourceSha256, measurements: checkpoint.measurements,
      views: checkpoint.views, findings: checkpoint.findings, unresolved,
      measurementEvidence: actual.packets.map(({ receipt, packet }) => ({
        receipt, scope: packet.scope, subjects: packet.subjects,
        findings: packet.findings, summary: packet.summary,
      })) },
    captures: actual.packets.flatMap(({ packet }) => packet.captures),
  };
}
export function measuredSlopReviewInput(root: string, checkpointSha256: string, offset = 0, limit = 1) {
  v.sha(checkpointSha256);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 8) fail('invalid review input page');
  const latest = currentPointer(root) ?? fail('measured checkpoint required');
  if (latest.checkpoint.sha256 !== checkpointSha256) fail('review input checkpoint changed');
  const checkpoint = saved<Checkpoint>(root, latest.checkpoint);
  current(root, checkpoint);
  if (offset > checkpoint.findings.length) fail('review input page exceeds finding inventory');
  const findings = checkpoint.findings.slice(offset, offset + limit);
  const viewIds = new Set(findings.flatMap(finding => finding.viewIds));
  const outstanding = inheritedSlopFindings(root, checkpoint.parent).findings;
  return {
    schema: 'slop-measured-review-input-page-v1',
    checkpoint: latest.checkpoint, measurements: checkpoint.measurements,
    offset, total: checkpoint.findings.length,
    nextOffset: offset + findings.length < checkpoint.findings.length ? offset + findings.length : null,
    findings,
    views: checkpoint.views.filter(view => viewIds.has(view.id)).map(({ subjectIds: _, ...view }) => view),
    reviewInput: {
      schema: 'slop-review-v2', checkpointSha256, summary: '',
      decisions: findings.map(finding => ({ id: finding.id, status: 'confirmed', disposition: 'repair-required',
        reason: '', viewIds: finding.viewIds, measurementRefs: [], contractEvidenceRefs: [] })),
      resolved: outstanding.map(resolution),
    },
  };
}
function resolution(finding: Finding): SlopMeasurementDecision {
  return { id: finding.id, status: 'dismissed', disposition: 'not-present-in-render', reason: '',
    viewIds: finding.viewIds, measurementRefs: [], contractEvidenceRefs: [] };
}
function save(writer: ProjectWriteAdapter, directory: string, value: unknown): Receipt {
  const bytes = canonicalBytes(value), sha = sha256(bytes), path = `.omd/slop/${directory}/${sha}.json`;
  writer.writeContentAddressed(path, bytes); return { path, sha256: sha };
}
function signed<T extends { schema: string }>(root: string, value: T): T & { signature: string } {
  return { ...value, signature: signNativeObservation(root, value.schema, digest(value)) };
}
function verify(root: string, value: { schema: string; signature: string }, schema: string) {
  const { signature, ...payload } = value;
  if (value.schema !== schema || !verifyNativeObservation(root, schema, digest(payload), signature)) fail('invalid native measured slop signature');
}
/** Narrow mapping: a generic source-to-render unknown never counts as an absence. */
export function ruleMeasurementKinds(rule: string): MetricKind[] {
  if (/WRAP|word.split/i.test(rule)) return ['control-word-wrap', 'line-lengths'];
  if (/CLIP|OVERFLOW/i.test(rule)) return ['clipping-overflow'];
  if (/TINTED|COLOR|ACCENT|GRADIENT/i.test(rule)) return ['canvas-color', 'accent-distribution', 'contrast-pair'];
  if (/SPACING|RADIUS|DIVIDER/i.test(rule)) return ['spacing-clusters', 'spacing-rhythm'];
  if (/TYPE|FONT|MONO|TEXT_UNDER|MICRO|LEADING|font-pair|terminal-styling/i.test(rule)) return ['type-ladder', 'text-minimum', 'line-lengths'];
  if (/COPY|EMOJI|GLYPH|REGISTER|SIGNPOST|sentence-break/i.test(rule)) return ['line-lengths', 'type-ladder'];
  return ['first-viewport-density', 'salience-regions', 'empty-canvas'];
}
function inventory(root: string, receipts: Receipt[]) {
  const packets = receipts.map(r => ({ receipt: r, packet: loadMeasurement(root, r) }));
  const views = packets.flatMap(({ receipt, packet }) => packet.captures.map(c => ({ id: c.viewId, packetSha256: receipt.sha256, image: c.capture, ir: c.ir,
    subjectIds: packet.subjects.filter(s => s.viewId === c.viewId).map(s => s.id) })));
  v.unique(views.map(view => `${view.packetSha256}:${view.id}`), 'measured slop view');
  const scan = scanSlopSource(root), rules = loadRules(rulesRoot).filter(r => r.category === 'slop');
  const allRulesSha256 = digest(rules);
  const findings: Finding[] = [...new Map(scan.candidates.map(candidate => {
    const finding: Finding = { id: digest(candidate), kind: 'source-candidate', rule: candidate.candidateId, path: `${candidate.path}:${candidate.line}`, question: candidate.reviewQuestion,
      viewIds: [...new Set(views.map(view => view.id))], subjectIds: [], packetSha256s: receipts.map(r => r.sha256), basis: 'heuristic', behavioral: ['fake-submit', 'all-property-transition', 'animated-status-glow'].includes(candidate.candidateId), kinds: ruleMeasurementKinds(candidate.candidateId) };
    return [finding.id, finding] as const;
  })).values()];
  const raws = views.map(view => JSON.parse(readArtifact(root, view.ir.path).toString('utf8')) as MeasuredIr);
  const rendered = views.map((view, i) => renderRuleInventory(raws[i]!, rules, view.ir.sha256, allRulesSha256));
  for (const [i, view] of views.entries()) for (const warning of rendered[i]!.warnings) {
    const packet = packets.find(p => p.receipt.sha256 === view.packetSha256)!.packet;
    const subjectIds = packet.subjects.filter(s => s.viewId === view.id && s.locator === warning.path).map(s => s.id);
    findings.push({ id: digest({ packet: view.packetSha256, view: view.id, rule: warning.id, path: warning.path }), kind: 'render-warning', rule: warning.id, path: warning.path, question: warning.message,
      viewIds: [view.id], subjectIds, packetSha256s: [view.packetSha256], basis: 'heuristic', behavioral: false, kinds: ruleMeasurementKinds(warning.id) });
  }
  for (const { packet, receipt } of packets) for (const f of packet.findings) findings.push({ id: f.id, kind: 'measurement', rule: f.code, path: '', question: f.observed?.value ?? f.code,
    viewIds: f.viewIds, subjectIds: f.subjectIds, packetSha256s: [receipt.sha256], basis: f.basis, behavioral: false, kinds: [...new Set(f.measurementIds.map(id => packet.measurements.find(m => m.id === id)!.kind))] });
  const merged = new Map<string, Finding>();
  for (const finding of findings) {
    const previous = merged.get(finding.id);
    merged.set(finding.id, previous ? { ...finding, packetSha256s: [...new Set([...previous.packetSha256s!, ...finding.packetSha256s!])] } : finding);
  }
  const applicable = new Set(rendered.flatMap(r => r.applicable));
  return { views, findings: [...merged.values()], filesScanned: scan.filesScanned,
    sourceSha256: sourceDigest(root), rulesSha256: digest(rules.filter(r => applicable.has(r.id))), packets };
}
function current(root: string, checkpoint: Checkpoint) {
  verify(root, checkpoint, 'slop-checkpoint-v2');
  const actual = inventory(root, checkpoint.measurements);
  for (const key of ['views', 'findings', 'filesScanned', 'sourceSha256', 'rulesSha256'] as const) if (digest(actual[key]) !== digest(checkpoint[key])) fail(`stale measured slop ${key}`);
  return actual;
}
function exceptionApplies(root: string, ref: { receipt: Receipt; field: string }, finding: Finding, packets: VisualMeasurement[]): boolean {
  // Only typed, currently owner-bound typography commitments are exceptions. Prose is not authority.
  if (!['TEXT_UNDER_12', 'SLOP-MICRO-LABELS', 'SLOP-DECORATIVE-MONOSPACE', 'default-font-pair', 'global-terminal-styling'].includes(finding.rule)
    || ref.receipt.path !== '.omd/type-proof.md' || sha256(readArtifact(root, ref.receipt.path)) !== ref.receipt.sha256
    || validateSourceBoundProofCurrentness(root, ['.omd/type-proof.md']).length) return false;
  const contract = loadContracts(root).contracts.type;
  const role = contract?.roles.find(role => ref.field === `Measurement contract.roles.${role.id}`);
  if (!role || !packets.every(p => p.binding.inputs.some(i => i.kind === 'type-proof' && digest(i.receipt) === digest(ref.receipt)))) return false;
  const subjects = packets.flatMap(p => p.subjects).filter(s => finding.viewIds.includes(s.viewId) && (!finding.subjectIds.length || finding.subjectIds.includes(s.id)));
  return subjects.length > 0 && subjects.every(s => s.role === role.id) && packets.every(p => p.measurements.filter(m => m.kind === 'contract-conformance').every(m => m.coverage.status === 'complete' && m.value.observations.filter(o => o.role === role.id).every(o => o.result === 'pass')));
}
function absent(root: string, checkpoint: Checkpoint, finding: Finding, measurement: Measurement, resolving: boolean): boolean {
  if (finding.kind === 'source-candidate') {
    // An extant source candidate is not mapped to an arbitrary DOM object. Repair must remove the
    // entire candidate family before a fresh, complete measured inventory can prove resolution.
    return resolving && !scanSlopSource(root).candidates.some(c => c.candidateId === finding.rule);
  }
  if (finding.rule === 'KO-CONTROL-WRAP' || finding.rule === 'REQUIRED_CONTROL_WORD_SPLIT') return measurement.kind === 'control-word-wrap' && measurement.value.splitCount === 0;
  if (/TEXT_UNDER_12|MICRO-LABELS|TINY-TEXT/.test(finding.rule)) return measurement.kind === 'text-minimum' && measurement.value.under12 === 0;
  if (finding.rule === 'SLOP-TINTED-CANVAS') return measurement.kind === 'canvas-color' && measurement.value.classification === 'neutral';
  if (finding.rule === 'SLOP-EMPTY-CANVAS') return measurement.kind === 'empty-canvas' && measurement.value.emptyRatio < 0.78;
  return resolving && !checkpoint.findings.some(f => f.rule === finding.rule && f.viewIds.some(id => measurement.viewIds.includes(id)));
}
function validateReview(root: string, input: unknown, receipt: Receipt, checkpoint: Checkpoint) {
  v.object({ schema: v.enumeration('slop-review-v2'), checkpointSha256: v.sha, summary: v.text, decisions: v.array(() => {}), resolved: v.array(() => {}) })(input);
  const candidate = input as Omit<Review, 'signature'>;
  if (candidate.checkpointSha256 !== receipt.sha256) fail('review does not bind checkpoint');
  const index = new MeasurementIndex(root, checkpoint.measurements), packets = checkpoint.measurements.map(r => index.packet(r.sha256));
  const validate = (decision: SlopMeasurementDecision, finding: Finding, resolving = false) => {
    const required = { id: finding.id, viewIds: finding.viewIds, subjectIds: resolving ? [] : finding.subjectIds, kinds: finding.kinds,
      blocking: !resolving && (finding.basis === 'contract' || finding.basis === 'accessibility' || finding.basis === 'coverage'), behavioral: finding.behavioral };
    const authority = { exceptionApplies: (ref: { receipt: Receipt; field: string }) => exceptionApplies(root, ref, finding, packets),
      absent: (m: Measurement) => absent(root, checkpoint, finding, m, resolving), behavioralOutcomeVerified: false };
    validateSlopMeasurementDecision(decision, index, required, authority);
    if (decision.status === 'dismissed') for (const packetSha256 of resolving ? checkpoint.measurements.map(r => r.sha256) : finding.packetSha256s ?? checkpoint.measurements.map(r => r.sha256)) {
      const viewIds = finding.viewIds.filter(id => index.packet(packetSha256).scope.some(s => s.id === id));
      if (!viewIds.length) continue;
      validateSlopMeasurementDecision({ ...decision, viewIds, measurementRefs: decision.measurementRefs.filter(r => r.packetSha256 === packetSha256) }, index, { ...required, viewIds }, authority);
    }
  };
  const exact = (actual: string[], expected: string[]) => new Set(actual).size === actual.length && digest([...actual].sort()) === digest([...expected].sort());
  if (!exact(candidate.decisions.map(d => d.id), checkpoint.findings.map(f => f.id))) fail('every measured finding needs one scoped disposition');
  candidate.decisions.forEach(d => validate(d, checkpoint.findings.find(f => f.id === d.id)!));
  const outstanding = inheritedSlopFindings(root, checkpoint.parent).findings;
  if (checkpoint.parent) {
    const old = historicalCheckpoint(root, checkpoint.parent.checkpoint);
    if (outstanding.length && measuredSlopScope(root, old) !== measuredSlopScope(root, checkpoint)) fail('repair scope changed');
    if (outstanding.length && old.sourceSha256 === checkpoint.sourceSha256 && digest(old.measurements) === digest(checkpoint.measurements)) fail('confirmed finding has no fresh after-render evidence');
  }
  if (!exact(candidate.resolved.map(d => d.id), outstanding.map(f => f.id))) fail('every outstanding issue needs an after-render resolution');
  for (const d of candidate.resolved) { if (d.status !== 'dismissed') fail('resolution still requires repair'); validate(d, outstanding.find(f => f.id === d.id)!, true); }
  return candidate;
}
export function captureMeasuredSlopCheckpoint(root: string, input: unknown, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation) {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const release = acquireProjectMutationLock(root, invocation);
  try {
  v.object({ schema: v.enumeration('slop-measured-scope-v2'), measurements: v.array(v.receipt) })(input);
  const measurements = (input as { measurements: Receipt[] }).measurements;
  if (measurements.length === 0) fail('current measurement receipts required');
  const historical = projectPathEntryExists(root, pointerPath) && !hasMeasuredSlopReview(root) ? checkSlopReview(root) : null;
  const actual = inventory(root, measurements), previous = historical ? null : currentPointer(root);
  const { packets: _packets, ...facts } = actual;
  const parent = previous ? { checkpoint: previous.checkpoint, review: previous.review } : null;
  const outstanding = inheritedSlopFindings(root, parent).findings;
  const checkpoint = signed(root, { schema: 'slop-checkpoint-v2' as const, ...facts, measurements, parent,
    ...(historical ? { historicalPredecessor: { checkpoint: historical.checkpoint, review: historical.review } } : {}) });
  if (previous && (!previous.review || outstanding.length)) {
    const old = historicalCheckpoint(root, previous.checkpoint);
    if (measuredSlopScope(root, old) !== measuredSlopScope(root, checkpoint)) fail('repair scope changed');
    if (old.sourceSha256 === checkpoint.sourceSha256 && digest(old.measurements) === digest(measurements)) fail('supersession requires fresh after-render evidence');
  }
  current(root, checkpoint);
  const receipt = save(writer, 'checkpoints', checkpoint);
  replaceProjectFileAtomically({ projectRoot: root, relativePath: pointerPath, content: canonicalBytes({ schema: 'slop-review-pointer-v2', checkpoint: receipt, review: null }), invocation });
  const decision = (finding: Finding): SlopMeasurementDecision => ({ id: finding.id, status: 'confirmed', disposition: 'repair-required', reason: '', viewIds: finding.viewIds, measurementRefs: [], contractEvidenceRefs: [] });
  return { checkpoint: receipt, findings: checkpoint.findings, reviewInput: { schema: 'slop-review-v2' as const, checkpointSha256: receipt.sha256, summary: '', decisions: checkpoint.findings.map(decision), resolved: outstanding.map(resolution) } };
  } finally { release(); }
}
export function publishMeasuredSlopReview(root: string, input: unknown, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation): Receipt {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const release = acquireProjectMutationLock(root, invocation);
  try {
  const latest = currentPointer(root) ?? fail('measured checkpoint required'), checkpoint = saved<Checkpoint>(root, latest.checkpoint);
  current(root, checkpoint);
  const review = validateReview(root, input, latest.checkpoint, checkpoint);
  if (latest.review) fail('review is immutable');
  const receipt = save(writer, 'reviews', signed(root, review));
  replaceProjectFileAtomically({ projectRoot: root, relativePath: pointerPath, content: canonicalBytes({ ...latest, review: receipt }), invocation }); return receipt;
  } finally { release(); }
}
export function checkRouteMeasuredSlopReview(root: string, invocation: ProjectRunInvocation, expected?: {
  measurements: readonly Receipt[]; slop?: { checkpoint: Receipt; review: Receipt };
  slopPolicy?: 'integrated-final-review-v1';
}) {
  const modelLed = isModelLedProcess(readPersistedRoute(root, invocation).sourceContract);
  if (expected?.slopPolicy !== undefined && !modelLed) fail('integrated final craft review requires the current model-led host policy');
  if (modelLed && !projectPathEntryExists(root, pointerPath)
    && (expected === undefined || expected.slopPolicy === 'integrated-final-review-v1')) return null;
  if (expected !== undefined && expected.slop === undefined) fail('present measured slop evidence must retain its exact checkpoint and review');
  return checkMeasuredSlopReview(root, expected?.slop === undefined ? undefined
    : { measurements: expected.measurements, slop: expected.slop });
}

export function checkMeasuredSlopReview(root: string, expected?: { measurements: readonly Receipt[]; slop: { checkpoint: Receipt; review: Receipt } }) {
  if (expected) {
    const pointer = currentPointer(root) ?? fail('current measured slop pointer required');
    if (digest(expected.slop) !== digest({ checkpoint: pointer.checkpoint, review: pointer.review })) fail('graph slop review is no longer current');
  }
  const latest = expected ? { schema: 'slop-review-pointer-v2' as const, ...expected.slop } : currentPointer(root) ?? fail('missing measured slop checkpoint');
  if (!latest.review) return fail('measured checkpoint has no review');
  const checkpoint = saved<Checkpoint>(root, latest.checkpoint), review = saved<Review>(root, latest.review);
  current(root, checkpoint); verify(root, review, 'slop-review-v2');
  const { signature: _signature, ...input } = review;
  validateReview(root, input, latest.checkpoint, checkpoint);
  if (review.decisions.some(d => d.status === 'confirmed')) fail('measured issues remain');
  if (expected && digest(expected.measurements) !== digest(checkpoint.measurements)) fail('slop must retain the exact graph measurement packets, not a recapture');
  const rounds = 1 + inheritedSlopFindings(root, checkpoint.parent).rounds;
  return { status: 'reviewed' as const, rounds, checkpoint: latest.checkpoint, review: latest.review, findings: checkpoint.findings.length,
    measurements: checkpoint.measurements,
    independence: 'not-attested' as const, scopeBinding: 'trusted-measured-packets-and-subjects' as const,
    advisoryDispositionIds: checkpoint.findings.filter(f => f.kind === 'measurement' && f.basis === 'heuristic' && review.decisions.some(d => d.id === f.id && d.status === 'dismissed')).map(f => f.id) };
}
