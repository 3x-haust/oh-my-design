import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import type { ProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { loadRefs } from '../core/ref/store.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { buildReferenceZoneReviewerPacket, publishReferenceZoneAdmission } from '../core/ref/reference-zone-admission.ts';
import { runPiReferenceAdmissionReviewer } from '../adapters/pi-reviewer-runtime.ts';
import { withNativeCommandSignal } from './native-command-signal.ts';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInput(value: unknown): Readonly<{
  referenceId: string; zoneId: string; axis: 'structure' | 'proportion' | 'density' | 'rhythm';
  viewport: Readonly<{ width: number; height: number }>;
}> {
  if (!object(value) || Object.keys(value).length !== 5
    || Object.keys(value).some(key => !['schema', 'referenceId', 'zoneId', 'axis', 'viewport'].includes(key))
    || value.schema !== 'reference-zone-review-input-v1'
    || typeof value.referenceId !== 'string' || !value.referenceId.trim()
    || typeof value.zoneId !== 'string' || !value.zoneId.trim()
    || (value.axis !== 'structure' && value.axis !== 'proportion' && value.axis !== 'density' && value.axis !== 'rhythm')
    || !object(value.viewport) || Object.keys(value.viewport).length !== 2
    || Object.keys(value.viewport).some(key => key !== 'width' && key !== 'height')
    || typeof value.viewport.width !== 'number' || !Number.isSafeInteger(value.viewport.width) || value.viewport.width < 1
    || typeof value.viewport.height !== 'number' || !Number.isSafeInteger(value.viewport.height) || value.viewport.height < 1) {
    throw new Error('REFERENCE_ZONE_REVIEW_INPUT_INVALID');
  }
  return { referenceId: value.referenceId, zoneId: value.zoneId, axis: value.axis,
    viewport: { width: value.viewport.width, height: value.viewport.height } };
}

export async function reviewReferenceZone(root: string, value: unknown, context: Readonly<{
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
  sourceContractSha256: string;
  task: string;
}>) {
  const input = parseInput(value);
  const references = loadRefs(root, { includeDomain: true }).filter(reference =>
    refIdentity(reference.source, reference.component) === input.referenceId);
  if (references.length !== 1) throw new Error('REFERENCE_ZONE_REFERENCE_REQUIRED');
  const reference = references[0];
  if (!reference) throw new Error('REFERENCE_ZONE_REFERENCE_REQUIRED');
  const packet = buildReferenceZoneReviewerPacket(root, {
    sourceContractSha256: context.sourceContractSha256, task: context.task,
    reference, zoneId: input.zoneId, axis: input.axis, viewport: input.viewport,
  });
  const reviewer = await withNativeCommandSignal(signal => runPiReferenceAdmissionReviewer({
    root, invocation: context.invocation, packet, signal,
  }));
  return publishReferenceZoneAdmission(root, packet, reviewer, context.invocation, context.writer);
}
