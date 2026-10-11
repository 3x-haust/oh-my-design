import type { Measurement, MeasurementRef, MetricKind, Receipt, VisualMeasurement } from './types.ts';
import { assertVerifiedPacket, loadMeasurement } from './files.ts';
import * as v from './validation.ts';
export const AXIS_METRICS = Object.freeze({
  typography: ['type-ladder', 'text-minimum', 'line-lengths', 'contract-conformance'],
  spacingRhythm: ['spacing-clusters', 'spacing-rhythm'],
  contrastColorRoles: ['contrast-pair', 'canvas-color', 'accent-distribution', 'contract-conformance'],
  density: ['first-viewport-density', 'empty-canvas', 'contract-conformance'],
  hierarchy: ['salience-regions', 'type-ladder'],
  composition: ['salience-regions', 'first-viewport-density', 'contract-conformance', 'cross-viewport-order'],
  beautyDesirability: ['type-ladder', 'spacing-rhythm', 'canvas-color', 'salience-regions'],
  domainSpecificity: ['first-viewport-density', 'contract-conformance'],
  humanAuthorship: ['salience-regions', 'type-ladder'],
  usability: ['clipping-overflow', 'control-word-wrap', 'line-lengths'],
  responsiveCraft: ['cross-viewport-order', 'clipping-overflow', 'control-word-wrap'],
} satisfies Record<string, readonly MetricKind[]>);
export type MeasuredAxis = keyof typeof AXIS_METRICS;
/** Constructed exclusively by current native packet verification, never by reviewer-provided JSON. */
export class MeasurementIndex {
  readonly #packets: Map<string, VisualMeasurement>;
  constructor(root: string, receipts: readonly Receipt[]) {
    if (!receipts.length) v.fail('native measurement receipts required');
    v.unique(receipts.map(r => r.sha256), 'packet receipt');
    this.#packets = new Map(receipts.map(r => [r.sha256, loadMeasurement(root, r)]));
  }
  packet(sha256: string): VisualMeasurement {
    const packet = this.#packets.get(sha256); if (!packet) return v.fail('unknown native packet');
    assertVerifiedPacket(packet); return packet;
  }
  resolve(ref: MeasurementRef): { packet: VisualMeasurement; measurement: Measurement } {
    const packet = this.packet(ref.packetSha256), measurement = packet.measurements.find(m => m.id === ref.measurementId);
    if (!measurement) return v.fail('measurement id does not belong to cited packet'); return { packet, measurement };
  }
  assertAxis(axis: MeasuredAxis, viewId: string, refs: MeasurementRef[], subjectIds: string[]): void {
    if (!refs.length) v.fail('GREEN needs measurement ids');
    const kinds = new Set<MetricKind>();
    for (const ref of refs) {
      const { packet, measurement } = this.resolve(ref);
      if (!measurement.viewIds.includes(viewId) || measurement.coverage.status !== 'complete') v.fail('citation has incomplete or unrelated view coverage');
      if (!(AXIS_METRICS[axis] as readonly MetricKind[]).includes(measurement.kind)) v.fail('citation kind is unrelated to axis');
      if (subjectIds.some(id => !measurement.subjectIds.includes(id))) v.fail('citation does not cover the claimed subjects');
      if (packet.summary.deterministicVerdict !== 'PASS' || packet.findings.some(f => f.severity === 'blocking' && f.viewIds.includes(viewId) && (!f.axes.length || f.axes.includes(axis)))) v.fail('deterministic RED/incomplete scope cannot be overruled by GREEN');
      kinds.add(measurement.kind);
    }
    if (AXIS_METRICS[axis].some(kind => !kinds.has(kind))) v.fail(`axis ${axis} omitted a mandatory measured inventory`);
  }
}
export type SlopMeasurementDecision = { id: string; status: 'confirmed' | 'dismissed'; reason: string; viewIds: string[]; measurementRefs: MeasurementRef[]; disposition: 'not-present-in-render' | 'contextual-exception' | 'repair-required'; contractEvidenceRefs: { receipt: Receipt; field: string }[] };
/** Integration boundary for slop/review.ts. Call before save; this function never mutates files. */
export function validateSlopMeasurementDecision(input: unknown, index: MeasurementIndex, finding: { id: string; viewIds: string[]; subjectIds: string[]; kinds: MetricKind[]; blocking: boolean; behavioral: boolean }, authority: { exceptionApplies(ref: { receipt: Receipt; field: string }, findingId: string): boolean; absent(measurement: Measurement, findingId: string): boolean; behavioralOutcomeVerified: boolean }): SlopMeasurementDecision {
  v.object({ id: v.text, status: v.enumeration('confirmed', 'dismissed'), reason: v.text, viewIds: v.array(v.text), measurementRefs: v.array(v.object({ packetSha256: v.sha, measurementId: v.pattern(/^vm1:[a-f0-9]{64}$/) })), disposition: v.enumeration('not-present-in-render', 'contextual-exception', 'repair-required'), contractEvidenceRefs: v.array(v.object({ receipt: v.receipt, field: v.text })) })(input);
  const decision = input as SlopMeasurementDecision;
  v.unique(decision.viewIds, 'decision view'); v.unique(decision.measurementRefs.map(r => `${r.packetSha256}:${r.measurementId}`), 'decision citation');
  if (decision.id !== finding.id || !decision.viewIds.length || finding.viewIds.some(id => !decision.viewIds.includes(id))) v.fail('dismissal omits finding views');
  if ((decision.status === 'confirmed') !== (decision.disposition === 'repair-required')) v.fail('repair-required cannot close a dismissed finding');
  if (decision.status === 'confirmed') return decision;
  if (finding.blocking) v.fail('deterministic contract/accessibility findings are not dismissible');
  if (finding.behavioral && !authority.behavioralOutcomeVerified) v.fail('static pixels cannot disprove a behavioral finding');
  for (const view of decision.viewIds) {
    const relevant = decision.measurementRefs.map(ref => index.resolve(ref)).filter(({ measurement: m }) => m.viewIds.includes(view) && finding.kinds.includes(m.kind) && m.coverage.status === 'complete' && finding.subjectIds.every(id => m.subjectIds.includes(id)));
    if (!relevant.length) v.fail('dismissal needs current relevant measured view/subject evidence');
    if (decision.disposition === 'not-present-in-render' && !relevant.some(({ measurement }) => authority.absent(measurement, finding.id))) v.fail('absence was not natively measured');
  }
  if (decision.disposition === 'contextual-exception' && (!decision.contractEvidenceRefs.length || !decision.contractEvidenceRefs.every(ref => authority.exceptionApplies(ref, finding.id)))) v.fail('contextual exception needs applicable owner-authorized contract evidence');
  return decision;
}
