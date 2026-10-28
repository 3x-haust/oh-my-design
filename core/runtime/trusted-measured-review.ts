import { browserTaskOutcomeContract } from '../brief/task-outcome.ts';
import { loadMeasuredObservationBindings } from '../evidence/final-v2-browser-observations.ts';
import { loadMeasuredQualityContext, assertMeasurementPacketsGreen } from '../evidence/final-v2-measurement.ts';
import { MEASURED_DESIGN_QUALITY_AXES, MEASURED_DESIGN_QUALITY_FLOORS, type MeasuredQualityContext } from '../evidence/final-v2-measured-quality.ts';
import { measurementProjection } from '../measure/projection.ts';
import { AXIS_METRICS } from '../measure/citations.ts';
import { loadReviewPolicy } from '../measure/review-policy.ts';
import { canonicalBytes, digest, sha256 } from '../measure/identity.ts';
import { readArtifact } from '../measure/inputs.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { reviewProfileBinding } from './trusted-review-profile.ts';
import { loadTerminalProcess } from '../evidence/final-v2-process.ts';
import { currentDeveloperCalibration } from '../coach/developer-calibration.ts';
import { sourceFreeTemporalRenders } from './native-temporal-evidence.ts';
import { NATIVE_TEMPORAL_EVIDENCE_LIMITS } from './native-outcome-review.ts';

export const MEASURED_REVIEW_TRANSPORT = 'measured-final-reviewer-transport-v1';
export const MEASURED_REVIEW_HANDBACK = 'measured-final-reviewer-handback-v1';
/** Value formats for the measured handback; the key lists alone left reviewers guessing PASS or score objects. */
export const MEASURED_VALUE_RULES = Object.freeze({ verdicts: 'each verdict is the string GREEN or RED', criticalFloors: 'each floor is one integer score from 0 to 4' });
/** The blind lane's designQuality row shape; the axis list alone left reviewers inventing an object keyed by axis. */
export const MEASURED_DESIGN_QUALITY_SHAPE = Object.freeze({
  designQuality: '{ schema: "design-quality-contract-v2", axes: [one row per axis, in the listed axis order] } and nothing else',
  axisRow: '{ axis, verdict: "GREEN" | "RED", score: integer 0-4, crossViewport: "preserved" | "weakened" | "contradicted", criticalFailure: null or text, evidence: [evidence rows] }',
  coverage: 'every axis cites the at-rest desktop and mobile views and any other view it bears on (a view where it found something must be cited under that axis); across all axes, every supplied required view/state is cited at least once',
  evidenceRow: '{ observationSha256, captureSha256, viewId, state, regionSubjectIds: [subject ids], packetSha256, measurementIds: ["vm1:..."], visibleCondition, userConsequence }',
});
export function measuredAdvisoryDispositionContract(context: MeasuredQualityContext, measurements: readonly { path: string; sha256: string }[]) {
  return {
    policy: context.advisoryDispositionPolicy,
    judgment: 'Inspect advisory findings alongside the whole captures in the existing axis assessments. No separate disposition form is required under integrated-final-review. Hard failures, evidence citations and quality floors remain binding.',
    findings: measurements.flatMap(receipt => context.index.packet(receipt.sha256).findings
      .filter(finding => finding.severity === 'advisory')
      .map(finding => ({ packetSha256: receipt.sha256, findingId: finding.id, axes: finding.axes,
        viewIds: finding.viewIds, measurementIds: finding.measurementIds })))
      .sort((left, right) => `${left.packetSha256}:${left.findingId}`.localeCompare(`${right.packetSha256}:${right.findingId}`)),
  };
}
export function measuredFinalRenderPacket(root: string, invocation: ProjectRunInvocation, observationSha256s: readonly string[]): Buffer {
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
  const terminal = observationSha256s.at(-1);
  const temporalRenders = terminal === undefined ? [] : sourceFreeTemporalRenders(root, invocation, terminal);
  const evidence = { schema: 'measured-final-reviewer-evidence-v1', candidateAlias: `candidate-${digest(observationSha256s).slice(0, 16)}`,
    context: { projectMode: route.projectMode, taskOutcome: browserTaskOutcomeContract(route.sourceContract.taskOutcome), designAxes: route.sourceContract.designAxes,
      requiredOutcomes: route.requiredOutcomes, prohibitedOutcomes: route.prohibitedOutcomes,
      developerCalibration: currentDeveloperCalibration(root, invocation) },
    measurementProjection: measurements.map(r => measurementProjection(context.index.packet(r.sha256), r.sha256)),
    observationProjection: renders.map(({ pngBase64: _, ...row }) => row), renders,
    ...(temporalRenders.length === 0 ? {} : {
      temporalRenders,
      temporalEvidenceLimits: [...NATIVE_TEMPORAL_EVIDENCE_LIMITS,
        'whole-progression-unmeasured', 'static-quality-from-settled-measured-renders-only'],
    }),
  };
  const evidenceSha256 = sha256(canonicalBytes(evidence));
  const fixedBindings = { observationSha256s, routeSha256: policy.routeSha256,
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    browserSha256: sha256(readArtifact(root, '.omd/decision-graph.json')), evidenceSha256, measurements, reviewPolicySha256: digest(policy), reviewProfile: reviewProfileBinding('blindLane'),
    processBindingSha256: digest(process.binding) };
  return canonicalBytes({ schema: MEASURED_REVIEW_TRANSPORT, evidenceSha256, evidence, outputContract: {
    schema: MEASURED_REVIEW_HANDBACK, lane: 'blindLane', laneSchema: 'measured-blind-review-v1', valueRules: { ...MEASURED_VALUE_RULES, ...MEASURED_DESIGN_QUALITY_SHAPE },
    verdictKeys: ['blindVisual', 'blindNarrative', ...(benchmark ? ['interactionBenchmarkFit', 'domainSpecificity'] : []), ...(route.projectMode === 'greenfield' ? ['realityFit'] : [])],
    criticalFloorKeys: ['composition', 'copy', ...(benchmark ? ['interactionQuality'] : [])],
    designQuality: { schema: 'design-quality-contract-v2', axes: MEASURED_DESIGN_QUALITY_AXES, floors: MEASURED_DESIGN_QUALITY_FLOORS, requiredMetricKinds: AXIS_METRICS,
      advisoryDispositionContract: measuredAdvisoryDispositionContract(context, measurements) },
    reviewerFields: ['schema', 'lane', 'verdicts', 'criticalFloors', 'designQuality', ...Object.keys(fixedBindings), 'findings'], fixedBindings,
  } });
}
