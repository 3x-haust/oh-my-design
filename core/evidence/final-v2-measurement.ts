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
import { projectPathEntryExists } from '../runtime/project-path-entry.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
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
  let advisoryDispositionPolicy: MeasuredQualityContext['advisoryDispositionPolicy'] = 'separate-slop-review';
  if (projectPathEntryExists(root, '.omd/slop/latest.json')) {
    if (!hasMeasuredSlopReview(root)) fail('current measured quality cannot use a legacy slop review pointer');
    const slop = checkMeasuredSlopReview(root);
    if (digest(slop.measurements) !== digest(receipts)) fail('slop review does not cover the exact measurement packets');
    advisoryDispositionIds = slop.advisoryDispositionIds;
  } else if (isModelLedProcess(readPersistedRoute(root, invocation).sourceContract)) advisoryDispositionPolicy = 'integrated-final-review';
  return { index, requiredViewIds: [...new Set(requiredViewIds)], policySha256: digest(policy), advisoryDispositionIds, advisoryDispositionPolicy, bindings };
}
/** Deterministic publication prerequisite; returns facts, never a beauty score. */
export function assertMeasurementPacketsGreen(root: string, receipts: readonly Receipt[]): void {
  if (!receipts.length) fail('current immutable measurement receipts required');
  for (const receipt of receipts) {
    const packet = loadMeasurement(root, receipt);
    if (packet.summary.deterministicVerdict !== 'PASS') {
      const blocking = packet.findings.filter(f => f.severity === 'blocking');
      fail(`measurement ${receipt.sha256} is ${packet.summary.deterministicVerdict}: ${blocking.map(f => f.code).join(',')}${measurementRepairHints(blocking, packet.captures, packet.scope, packet.subjects)}`);
    }
  }
}

/** Why the measurer could not read the text, counted, with the change that lets it: the codes alone said nothing. */
const UNMEASURED_HINTS: Readonly<Record<string, string>> = Object.freeze({
  'ancestor-opacity': 'text sits inside an element with opacity below 1 (a reveal still hidden, or muted text made with opacity): show content at once under prefers-reduced-motion, and mute text with a colour rather than opacity',
  'occluded-text': 'text is covered by another element at its centre (an overlay, a sticky layer or a decoration on top of it)',
  'transformed-geometry': 'text is rotated, scaled or skewed',
  'complex-backdrop': 'text sits on a gradient, image, blend or filter background, so its contrast cannot be read',
  'unstable-capture': 'the page was still changing while measured; let animations and timers settle',
  'media-salience-unsampled': 'an image the measurer could not sample (not loaded, hidden behind another layer, or drawn where no sample point lands); make sure it loads and shows at rest',
  'opaque-content': 'text sits in content the measurer cannot see into (canvas, video, iframe)',
});

type CaptureStability = Readonly<{ viewId: string; stability: Readonly<{ status: string; beforePixelSha256: string; afterPixelSha256: string }> }>;

/** Which views moved while measured, and whether the pixels or only the layout and text changed. */
function unstableViews(captures: readonly CaptureStability[], scope: readonly Readonly<{ id: string; state: string }>[]): string {
  const rows = captures.filter(capture => capture.stability.status !== 'stable').map(capture => {
    const state = scope.find(view => view.id === capture.viewId)?.state ?? 'initial';
    const where = `${capture.viewId.split('@')[0]} ${state === 'initial' ? 'at rest' : `after ${state}`}`;
    return capture.stability.beforePixelSha256 !== capture.stability.afterPixelSha256 ? `${where} (pixels changed between two shots)`
      : `${where} (pixels held, layout or text changed: something off-screen is still moving, loading or counting)`;
  });
  return rows.length ? ` Unstable views: ${rows.slice(0, 6).join('; ')}${rows.length > 6 ? `; and ${rows.length - 6} more` : ''}.` : '';
}

/** The texts below their contrast threshold, with the measured ratio, so the repair targets them all at once. */
function contrastFailures(blocking: readonly { code: string; subjectIds?: readonly string[]; observed?: { value?: unknown } | null }[],
  subjects: readonly Readonly<{ id: string; textExcerpt: string | null }>[]): string {
  const seen = new Map<string, { ratio: number; threshold: number }>();
  for (const finding of blocking.filter(f => f.code === 'TEXT_CONTRAST_FAIL')) {
    let rows: { ratio?: unknown; threshold?: unknown }[] = [];
    try { rows = JSON.parse(String(finding.observed?.value ?? '[]')) as typeof rows; } catch { continue; }
    (finding.subjectIds ?? []).forEach((id, index) => {
      const text = subjects.find(subject => subject.id === id)?.textExcerpt?.trim(), row = rows[index];
      if (!text || typeof row?.ratio !== 'number' || typeof row.threshold !== 'number') return;
      const key = text.slice(0, 40), known = seen.get(key);
      if (!known || row.ratio < known.ratio) seen.set(key, { ratio: row.ratio, threshold: row.threshold });
    });
  }
  if (!seen.size) return '';
  const rows = [...seen].sort((a, b) => a[1].ratio - b[1].ratio).slice(0, 8)
    .map(([text, { ratio, threshold }]) => `"${text}" ${ratio.toFixed(2)}:1 (needs ${threshold}:1)`);
  return `. Text below its contrast threshold: ${rows.join('; ')}${seen.size > 8 ? `; and ${seen.size - 8} more` : ''}; darken the text or lighten its ground`;
}

export function measurementRepairHints(blocking: readonly { code: string; subjectIds?: readonly string[]; observed?: { value?: unknown } | null }[],
  captures: readonly CaptureStability[] = [], scope: readonly Readonly<{ id: string; state: string }>[] = [],
  subjects: readonly Readonly<{ id: string; textExcerpt: string | null }>[] = []): string {
  const counts = new Map<string, number>();
  for (const finding of blocking) {
    for (const match of String(finding.observed?.value ?? '').matchAll(/"reason":"([a-z,-]+)"/g)) {
      for (const reason of match[1]!.split(',')) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const hints = [...counts].sort((a, b) => b[1] - a[1]).flatMap(([reason, count]) => UNMEASURED_HINTS[reason] ? [`${reason} ×${count}: ${UNMEASURED_HINTS[reason]}`] : []);
  return `${hints.length ? `. Unmeasured text: ${hints.join('; ')}${counts.has('unstable-capture') ? unstableViews(captures, scope) : ''}` : ''}`
    + contrastFailures(blocking, subjects);
}
