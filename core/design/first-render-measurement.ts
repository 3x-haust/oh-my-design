import type { DesignHypothesis } from './judgment.ts';
import type { MeasurementRef, Receipt, VisualMeasurement } from '../measure/types.ts';
import { loadMeasurement, assertVerifiedPacket } from '../measure/files.ts';
import { digest } from '../measure/identity.ts';
import { unionArea } from '../measure/geometry.ts';
export function deriveFirstRenderProjection(packet: VisualMeasurement, receipt: Receipt) {
  assertVerifiedPacket(packet);
  return packet.scope.filter(v => v.state === 'initial').map(view => {
    const metrics = packet.measurements.filter(m => m.viewIds.includes(view.id));
    const conformance = metrics.find(m => m.kind === 'contract-conformance');
    const regions = conformance?.kind === 'contract-conformance' ? conformance.value.observations.filter(o => o.property === 'visible-count') : [];
    const ids = (role: string) => regions.filter(o => o.role === role).flatMap(o => o.subjectIds);
    const subjects = packet.subjects.filter(s => s.viewId === view.id && s.visibleBox);
    const area = (ids: string[]) => unionArea(subjects.filter(s => ids.includes(s.id)).map(s => s.visibleBox));
    const density = metrics.find(m => m.kind === 'first-viewport-density');
    const viewportArea = density?.kind === 'first-viewport-density' ? density.value.viewportArea : view.viewport.width * view.viewport.height;
    return { viewId: view.id, headings: subjects.filter(s => ['heading', 'display', 'section'].includes(s.role)).flatMap(s => s.textExcerpt ? [s.textExcerpt] : []), taskObjectCount: regions.some(r => r.role === 'task') ? ids('task').length : null,
      taskAreaShare: regions.some(r => r.role === 'task') ? area(ids('task')) / viewportArea : null, utilityAreaShare: regions.some(r => r.role === 'utility') ? area(ids('utility')) / viewportArea : null,
      trustLabels: subjects.filter(s => ids('status').includes(s.id) || ids('evidence').includes(s.id)).flatMap(s => s.textExcerpt ? [s.textExcerpt] : []),
      measurementRefs: metrics.filter(m => ['contract-conformance', 'salience-regions', 'first-viewport-density', 'empty-canvas'].includes(m.kind)).map(m => ({ packetSha256: receipt.sha256, measurementId: m.id })) };
  });
}
export function critiqueMeasuredFirstRender(hypothesis: DesignHypothesis, packet: VisualMeasurement, receipt: Receipt) {
  const projection = deriveFirstRenderProjection(packet, receipt);
  const findings: { id: string; severity: 'critical' | 'advisory'; viewIds: string[]; message: string; measurementRefs: MeasurementRef[] }[] = packet.findings.map(f => ({ id: f.id, severity: f.severity === 'blocking' ? 'critical' : 'advisory', viewIds: f.viewIds, message: f.code, measurementRefs: f.measurementIds.map(measurementId => ({ packetSha256: receipt.sha256, measurementId })) }));
  for (const view of projection) {
    if (view.taskObjectCount === null) findings.push({ id: `TASK_MAPPING_UNKNOWN:${view.viewId}`, severity: 'advisory', viewIds: [view.viewId], message: 'No owner-selected task-region mapping; dominance is unmeasured.', measurementRefs: view.measurementRefs });
    if (hypothesis.comparisonRequired && view.taskObjectCount !== null && view.taskObjectCount < 2) findings.push({ id: `COMPARISON_THIN:${view.viewId}`, severity: 'advisory', viewIds: [view.viewId], message: 'Fewer than two mapped comparison objects are visible.', measurementRefs: view.measurementRefs });
  }
  return { schema: 'first-render-measured-critic-v1' as const, verdict: findings.some(f => f.severity === 'critical') ? 'revise' as const : 'retain' as const, hypothesisSha256: digest(hypothesis), projection, findings,
    qualitativeQuestions: ['Does the initial viewport communicate its purpose?', 'Does the visible evidence justify trust?', 'Does the task object have the right priority?'] };
}
export function measuredFirstRenderReport(root: string, hypothesis: DesignHypothesis, receipt: Receipt) { return critiqueMeasuredFirstRender(hypothesis, loadMeasurement(root, receipt), receipt); }
