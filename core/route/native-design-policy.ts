import { join } from 'node:path';
import { readPiReviewPurpose } from '../../extensions/omd-review-purpose.ts';
import { verifyDirectionAutonomyGrant } from '../brief/candidate-authority.ts';
import { getNativePiRun, isNativePiInvocation } from '../runtime/native-pi-run.ts';
import { nativePiDigest, readNativePiFile } from '../runtime/native-pi-run-record.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { failAdaptiveRoute } from './adaptive-flow-domain.ts';
import { MODEL_LED_STRATEGY_DECISION } from './adaptive-flow-domain.ts';

/** The native host owns this policy; authored route JSON cannot grant or revoke it. */
export function bindNativeDesignRouteInput(root: string, invocation: ProjectRunInvocation, value: unknown): unknown {
  if (!isNativePiInvocation(invocation)) return value;
  const run = getNativePiRun(invocation, root);
  if (run.designPolicy === undefined) return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'route input must be an object');
  }
  const request = Reflect.get(value, 'request');
  if (typeof request !== 'string' || nativePiDigest(request) !== run.briefSha256) {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'native design policy belongs to the exact original request');
  }
  const path = '.omd/native-pi/run.json';
  const autonomyGrant = { path, sha256: nativePiDigest(readNativePiFile(root, join(root, path))) };
  const authority = verifyDirectionAutonomyGrant(root, autonomyGrant, request);
  if (authority.source !== 'native-host-policy' || authority.runId !== run.runId) {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'native design policy belongs to another run');
  }
  const purpose = readPiReviewPurpose(root, request);
  const authoredPurpose = Reflect.get(value, 'reviewPurpose');
  if (authoredPurpose !== undefined && authoredPurpose !== 'ordinary' && authoredPurpose !== purpose.reviewPurpose) {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose differs from the genuine host input');
  }
  if (run.designPolicy.criteriaVersion !== 'model-led-design-v1') {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'legacy structured native runs cannot publish a production route');
  }
  if (purpose.reviewPurpose !== 'ordinary' || Reflect.get(value, 'deliveryMode') !== undefined) {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'only ordinary model-led implementation routes are supported');
  }
  const input = Object.fromEntries(Object.entries(value).filter(([key]) =>
    !['processPolicy', 'reviewPurpose', 'reviewPurposeAuthority', 'deliveryMode', 'strategyDecision'].includes(key)));
  return { ...input, ...purpose, strategyDecision: MODEL_LED_STRATEGY_DECISION,
    processPolicy: { schema: 'model-led-design-process-v1', interactionMode: 'autonomous', autonomyGrant } };
}
