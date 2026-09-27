import { MeasurementIndex } from '../measure/citations.ts';
import { loadMeasurement } from '../measure/files.ts';
import { digest } from '../measure/identity.ts';
import { loadReviewPolicy } from '../measure/review-policy.ts';
import type { Receipt } from '../measure/types.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { loadMeasuredObservationBindings } from './final-v2-browser-observations.ts';
import type { MeasuredQualityContext } from './final-v2-measured-quality.ts';
import { fail } from '../measure/validation.ts';
import { checkMeasuredSlopReview, hasMeasuredSlopReview } from '../slop/measured-review.ts';
import { loadTerminalProcess } from './final-v2-process.ts';
/** Native observation-to-packet join. Caller view names and plain screenshot hashes are not authority. */
export function loadMeasuredQualityContext(root: string, invocation: ProjectRunInvocation, receipts: readonly Receipt[], observationSha256s: readonly string[]): MeasuredQualityContext {
  const index = new MeasurementIndex(root, receipts), policy = loadReviewPolicy(root, invocation);
  const observed = loadMeasuredObservationBindings(root, invocation, observationSha256s), bindings: MeasuredQualityContext['bindings'][number][] = [], requiredViewIds: string[] = [];
  if (digest([...new Set(observed.map(o => o.measurement.packet.sha256))].sort()) !== digest(receipts.map(r => r.sha256).sort())) fail('measurement receipts must exactly cover the authenticated terminal observation');
  for (const receipt of receipts) {
    const packet = index.packet(receipt.sha256);
    if (packet.binding.activationBuildSha256 !== invocation.current.buildSha256 || packet.binding.routeSha256 !== policy.routeSha256 || packet.binding.sourceContractSha256 !== policy.sourceContractSha256) fail('measurement is not bound to the current route/tool build/source contract');
    for (const view of packet.scope) {
      const capture = packet.captures.find(c => c.viewId === view.id);
      if (!capture) fail('required measured view was not captured');
      requiredViewIds.push(view.id);
      const matches = observed.filter(o => o.captureSha256 === capture!.capture.sha256 && o.state === view.state
        && o.measurement.packet.sha256 === receipt.sha256 && o.measurement.packet.path === receipt.path
        && o.measurement.viewId === view.id && o.measurement.browserZoom === view.browserZoom && o.measurement.stateRecipeSha256 === view.stateRecipeSha256
        && digest(o.measurement.viewport) === digest(view.viewport)
        && o.measurement.layoutViewport.width === capture!.observedViewport.innerWidth && o.measurement.layoutViewport.height === capture!.observedViewport.innerHeight);
      if (!matches.length) fail('packet capture/state has no authenticated browser observation');
      for (const o of matches) bindings.push({ observationSha256: o.observationSha256, captureSha256: o.captureSha256, packetSha256: receipt.sha256, viewId: view.id, state: view.state, browserZoom: view.browserZoom });
    }
  }
  if (bindings.length !== observed.length) fail('authenticated observation contains an unmeasured or duplicate view');
  let advisoryDispositionIds: string[] = [];
  if (hasMeasuredSlopReview(root)) {
    const slop = checkMeasuredSlopReview(root);
    const process = loadTerminalProcess(root, invocation, observationSha256s);
    const expected = [...new Map([...receipts, ...process?.binding.surface?.measurements ?? []].map(r => [r.sha256, r])).values()];
    if (digest(slop.measurements) !== digest(expected)) fail('slop review does not cover the exact measurement packets');
    advisoryDispositionIds = slop.advisoryDispositionIds;
  }
  return { index, requiredViewIds: [...new Set(requiredViewIds)], policySha256: digest(policy), advisoryDispositionIds, bindings };
}
/** Deterministic publication prerequisite; returns facts, never a beauty score. */
export function assertMeasurementPacketsGreen(root: string, receipts: readonly Receipt[]): void {
  if (!receipts.length) fail('current immutable measurement receipts required');
  for (const receipt of receipts) {
    const packet = loadMeasurement(root, receipt);
    if (packet.summary.deterministicVerdict !== 'PASS') fail(`measurement ${receipt.sha256} is ${packet.summary.deterministicVerdict}: ${packet.findings.filter(f => f.severity === 'blocking').map(f => f.code).join(',')}`);
  }
}
