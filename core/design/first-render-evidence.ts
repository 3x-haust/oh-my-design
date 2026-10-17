import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { firstRenderContext } from './first-render-context.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { measureProject } from '../measure/index.ts';
import { loadMeasurement } from '../measure/files.ts';
import { canonicalBytes, digest, sha256 } from '../measure/identity.ts';
import { readArtifact } from '../measure/inputs.ts';
import type { VisualMeasurement } from '../measure/types.ts';
import { critiqueMeasuredFirstRender } from './first-render-measurement.ts';

const PATH = '.omd/first-render-critic.json';
const fail = (message: string): never => { throw new Error(`FIRST_RENDER_REQUIRED: ${message}; rerun first-render check --page <local-build.html>`); };
const REVIEW_VIEWS = Object.freeze([
  Object.freeze({ viewport: { width: 1280, height: 900 }, label: 'desktop' }),
  Object.freeze({ viewport: { width: 390, height: 844 }, label: 'mobile' }),
]);

function measuredReviewCaptures(packet: VisualMeasurement) {
  return REVIEW_VIEWS.map(({ viewport, label }) => {
    const view = packet.scope.find((item) => item.state === 'initial' && item.browserZoom === 1
      && item.viewport.width === viewport.width && item.viewport.height === viewport.height)
      ?? fail(`${label} measurement view is missing`);
    const binding = packet.captures.find((item) => item.viewId === view.id)
      ?? fail(`${label} measurement capture is missing`);
    if (binding.image.width !== viewport.width || binding.image.height !== viewport.height) {
      return fail(`${label} measurement dimensions changed`);
    }
    return {
      sourcePath: binding.capture.path,
      record: Object.freeze({
        path: `.omd/first-render/captures/${binding.capture.sha256}.png`,
        sha256: binding.capture.sha256,
        viewport,
        fullPage: false as const,
      }),
    };
  });
}

/** The old surface argument is retained only to issue an explicit migration refusal. */
export async function publishFirstRenderCheck(root: string, page: string, input: unknown, writer: ProjectWriteAdapter, invocation?: ProjectRunInvocation) {
  if (input !== undefined) return fail('agent-authored surfaces cannot publish measurement-derived evidence; remove --input');
  if (!invocation) return fail('current invocation is required');
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const context = firstRenderContext(root, invocation);
  const modelLed = context.schema === 'model-led-first-render-context-v1';
  const hypothesis = context.schema === 'hypothesis-first-render-context-v1' ? context.hypothesis : null;
  const result = await measureProject({ root, entry: page, writer, invocation });
  const packet = loadMeasurement(root, result.packet);
  const reviewCaptures = measuredReviewCaptures(packet);
  const native = { schema: modelLed ? 'first-render-check-v4' as const : 'first-render-check-v3' as const,
    ...(modelLed ? { context } : {}), page, measurements: [result.packet],
    captures: reviewCaptures.map(({ record }) => record),
    sourceSha256: packet.binding.sourceSha256, buildSha256: packet.binding.production[0]!.servedTreeSha256,
    hypothesisSha256: digest(hypothesis), report: critiqueMeasuredFirstRender(hypothesis, packet, result.packet), interpretation: 'native-measurement-derived' as const };
  const signingSchema = modelLed ? 'first-render-v4' : 'first-render-v3';
  const record = { ...native, signature: signNativeObservation(realpathSync(root), signingSchema, digest(native)) };
  const reportSha256 = digest(record), body = canonicalBytes({ ...record, reportSha256 });
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    loadMeasurement(root, result.packet);
    if (digest(firstRenderContext(root, invocation)) !== digest(context)) return fail('design context changed during capture');
    for (const capture of reviewCaptures) {
      writer.writeContentAddressed(capture.record.path, readArtifact(root, capture.sourcePath));
    }
    writer.writeContentAddressed(`.omd/first-render/reports/${reportSha256}.json`, body);
    replaceProjectFileAtomically({ projectRoot: root, relativePath: PATH, content: body, invocation });
  } finally { unlock(); }
  return { ...record, reportSha256 };
}
/** Historical v2 is inspectable as JSON, but cannot authorize a new measured completion. */
export function checkFirstRenderEvidence(root: string, purpose: 'review' | 'acceptance' = 'acceptance', invocation?: ProjectRunInvocation) {
  if (!existsSync(resolve(root, PATH))) {
    if (existsSync(resolve(root, '.omd/design-judgment.json'))) return fail('report is missing');
    return null;
  }
  const bytes = readArtifact(root, PATH), { reportSha256, ...record } = JSON.parse(bytes.toString('utf8'));
  const modelLed = record.schema === 'first-render-check-v4';
  if ((!modelLed && record.schema !== 'first-render-check-v3') || typeof reportSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reportSha256) || digest(record) !== reportSha256) return fail('legacy-unmeasured or invalid report');
  if (!bytes.equals(readArtifact(root, `.omd/first-render/reports/${reportSha256}.json`))) return fail('immutable report differs');
  const { signature, ...native } = record;
  if (typeof signature !== 'string' || !verifyNativeObservation(realpathSync(root), modelLed ? 'first-render-v4' : 'first-render-v3', digest(native), signature)) return fail('native report signature invalid');
  if (!Array.isArray(record.measurements) || record.measurements.length !== 1) return fail('measurement receipt required');
  const packet = loadMeasurement(root, record.measurements[0]);
  const expectedCaptures = measuredReviewCaptures(packet).map(({ record }) => record);
  if (digest(record.captures) !== digest(expectedCaptures)) return fail('independent review capture bindings changed');
  for (const capture of expectedCaptures) {
    if (sha256(readArtifact(root, capture.path)) !== capture.sha256) return fail('independent review capture bytes changed');
  }
  if (modelLed && !invocation) return fail('authenticated model-led invocation is required');
  const context = firstRenderContext(root, invocation);
  if (modelLed !== (context.schema === 'model-led-first-render-context-v1')
    || modelLed && digest(record.context) !== digest(context)
    || !modelLed && record.context !== undefined) return fail('design context changed');
  const hypothesis = context.schema === 'hypothesis-first-render-context-v1' ? context.hypothesis : null;
  if (record.hypothesisSha256 !== digest(hypothesis) || digest(record.report) !== digest(critiqueMeasuredFirstRender(hypothesis, packet, record.measurements[0]))) return fail('hypothesis or measured critic result changed');
  if (record.sourceSha256 !== packet.binding.sourceSha256 || record.buildSha256 !== packet.binding.production[0]?.servedTreeSha256) return fail('stale source/build remain');
  if (purpose === 'acceptance' && record.report.verdict !== 'retain') return fail('critical findings remain');
  return { ...record, reportSha256 };
}
