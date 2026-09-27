import { browserTaskOutcomeContract } from '../brief/task-outcome.ts';
import { loadMeasuredObservationBindings } from '../evidence/final-v2-browser-observations.ts';
import { loadMeasuredQualityContext, assertMeasurementPacketsGreen } from '../evidence/final-v2-measurement.ts';
import { MEASURED_DESIGN_QUALITY_AXES, MEASURED_DESIGN_QUALITY_FLOORS } from '../evidence/final-v2-measured-quality.ts';
import { measurementProjection } from '../measure/projection.ts';
import { AXIS_METRICS } from '../measure/citations.ts';
import { loadReviewPolicy } from '../measure/review-policy.ts';
import { canonicalBytes, digest, sha256 } from '../measure/identity.ts';
import { readArtifact } from '../measure/inputs.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { reviewProfileBinding } from './trusted-review-profile.ts';
import { loadTerminalProcess } from '../evidence/final-v2-process.ts';

export const MEASURED_REVIEW_TRANSPORT = 'measured-final-reviewer-transport-v1';
export const MEASURED_REVIEW_HANDBACK = 'measured-final-reviewer-handback-v1';
export function measuredFinalRenderPacket(root: string, invocation: ProjectRunInvocation, observationSha256s: readonly string[], artDirectionSha256?: string): Buffer {
  const policy = loadReviewPolicy(root, invocation), route = readPersistedRoute(root, invocation);
  const process = loadTerminalProcess(root, invocation, observationSha256s);
  const bindings = loadMeasuredObservationBindings(root, invocation, observationSha256s);
  const measurements = [...new Map(bindings.map(b => [b.measurement.packet.sha256, b.measurement.packet])).values()];
  assertMeasurementPacketsGreen(root, measurements);
  const context = loadMeasuredQualityContext(root, invocation, measurements, observationSha256s);
  const renders = bindings.map(b => {
    const packet = context.index.packet(b.measurement.packet.sha256), capture = packet.captures.find(c => c.viewId === b.measurement.viewId)!;
    return { observationSha256: b.observationSha256, browserObservationSha256: b.browserObservationSha256,
      captureSha256: b.captureSha256, packetSha256: b.measurement.packet.sha256, viewId: b.measurement.viewId, state: b.state,
      browserZoom: b.measurement.browserZoom, viewport: b.measurement.viewport, layoutViewport: b.measurement.layoutViewport,
      width: capture.image.width, height: capture.image.height, pngBase64: readArtifact(root, capture.capture.path).toString('base64') };
  });
  const benchmark = route.gates.includes('greenfield-task-flow-benchmark');
  const evidence = { schema: 'measured-final-reviewer-evidence-v1', candidateAlias: `candidate-${digest(observationSha256s).slice(0, 16)}`,
    context: { projectMode: route.projectMode, taskOutcome: browserTaskOutcomeContract(route.sourceContract.taskOutcome), designAxes: route.sourceContract.designAxes,
      requiredOutcomes: route.requiredOutcomes, prohibitedOutcomes: route.prohibitedOutcomes },
    measurementProjection: [...new Map([...measurements.map(r => measurementProjection(context.index.packet(r.sha256), r.sha256)), ...process?.projections ?? []].map(p => [p.packetSha256, p])).values()],
    ...(process?.plan ? { surfaceContext: process.plan.surfaces.map(({ id, purpose, states, taskIds }) => ({ id, purpose, taskIds, states: states.map(({ id, required, primaryActionId }) => ({ id, required, primaryActionId })) })),
      surfaceReviewContract: { schema: 'surface-review-v1', rows: process.surfaceRows } } : {}),
    observationProjection: renders.map(({ pngBase64: _, ...row }) => row), renders: [...renders, ...process?.supplementalRenders ?? []] };
  const evidenceSha256 = sha256(canonicalBytes(evidence));
  const fixedBindings = { observationSha256s, routeSha256: policy.routeSha256, ...(artDirectionSha256 ? { artDirectionSha256 } : {}),
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    browserSha256: sha256(readArtifact(root, '.omd/decision-graph.json')), evidenceSha256, measurements, reviewPolicySha256: digest(policy), reviewProfile: reviewProfileBinding('blindLane'),
    ...(process ? { processBindingSha256: digest(process.binding) } : {}) };
  return canonicalBytes({ schema: MEASURED_REVIEW_TRANSPORT, evidenceSha256, evidence, outputContract: {
    schema: MEASURED_REVIEW_HANDBACK, lane: 'blindLane', laneSchema: 'measured-blind-review-v1',
    verdictKeys: ['blindVisual', 'blindNarrative', ...(benchmark ? ['interactionBenchmarkFit', 'domainSpecificity'] : []), ...(route.projectMode === 'greenfield' ? ['realityFit'] : [])],
    criticalFloorKeys: ['composition', 'copy', ...(benchmark ? ['interactionQuality'] : [])],
    designQuality: { schema: 'design-quality-contract-v2', axes: MEASURED_DESIGN_QUALITY_AXES, floors: MEASURED_DESIGN_QUALITY_FLOORS, requiredMetricKinds: AXIS_METRICS },
    reviewerFields: ['schema', 'lane', 'verdicts', 'criticalFloors', 'designQuality', ...(process?.plan ? ['surfaceReview'] : []), ...Object.keys(fixedBindings), 'findings'], fixedBindings,
  } });
}
