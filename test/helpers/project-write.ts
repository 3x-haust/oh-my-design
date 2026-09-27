import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authorizeTestPayloads, createLocalCliInvocation, type TestPayloadAuthorization } from '../../core/runtime/activation.ts';
import type { ProjectRunInvocation } from '../../core/runtime/invocation.ts';
import { createProjectWriteAdapter, type ProjectWriteAdapter } from '../../core/runtime/project-write.ts';
import {
  adaptiveRouteAuthorityBytes,
  adaptiveRouteRecordSha256,
  publishAdaptiveRoute,
  routeAdaptiveFlow,
} from '../../core/route/index.ts';
import { canonicalRouteJson } from '../../core/route/adaptive-source-contract.ts';
import { signNativeObservation } from '../../core/runtime/self-signed-activation.ts';

const CLI_PATH = fileURLToPath(new URL('../../bin/omd.ts', import.meta.url));
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

export function withTestReviewPurposeAuthority(root: string, input: unknown): Record<string, unknown> {
  const route = structuredClone(input) as Record<string, unknown>;
  const projectRoot = realpathSync(root);
  const payload = {
    schema: 'review-purpose-origin-v1' as const, projectRoot, purpose: 'ordinary' as const,
    requestSha256: sha256(route.request as string), source: 'host-user-input' as const,
    observedAt: '2026-09-27T00:00:00.000Z',
  };
  const record = { ...payload, signature: signNativeObservation(projectRoot, payload.schema, sha256(canonicalRouteJson(payload))) };
  const bytes = Buffer.from(`${canonicalRouteJson(record)}\n`);
  const digest = sha256(bytes);
  const path = `.omd/review-purpose-authorities/sha256-${digest}.json`;
  mkdirSync(join(root, '.omd/review-purpose-authorities'), { recursive: true });
  writeFileSync(join(root, path), bytes);
  route.reviewPurposeAuthority = { path, sha256: digest };
  return route;
}

/** Creates a Node-test-runner-bound project-write invocation for a temporary project root. */
export function createTestProjectRunInvocation(root: string, brief?: unknown): ProjectRunInvocation {
  return createLocalCliInvocation({ cliPath: CLI_PATH, argv: [], projectRoot: root, brief });
}
export function authorizeTestProjectRunPayloads(root: string, invocation: ProjectRunInvocation, authorizations: readonly TestPayloadAuthorization[]): void {
  authorizeTestPayloads(invocation, root, authorizations);
}
export function authorizeTestTaskEvidencePayloads(
  root: string,
  invocation: ProjectRunInvocation,
  payloads: Readonly<{ probeResults: readonly Uint8Array[]; captureResults: readonly Uint8Array[]; }>,
): void {
  authorizeTestPayloads(invocation, root, [
    ...payloads.probeResults.map(payload => ({ purpose: 'product-probe-result' as const, payload })),
    ...payloads.captureResults.map(payload => ({ purpose: 'product-capture-result' as const, payload })),
  ]);
}

export function publishTestAdaptiveRoute(
  root: string,
  input: unknown,
  brief = 'adaptive-route',
): ProjectRunInvocation {
  const invocation = createTestProjectRunInvocation(root, brief);
  const record = routeAdaptiveFlow(input);
  authorizeTestPayloads(invocation, root, [{
    purpose: 'adaptive-route-authority',
    payload: adaptiveRouteAuthorityBytes(record, adaptiveRouteRecordSha256(record), invocation),
  }]);
  publishAdaptiveRoute(root, input, createProjectWriteAdapter(root, invocation), invocation);
  return invocation;
}

/** Creates a Node-test-runner-bound project-write adapter for direct API test fixtures. */
export function createTestProjectWriteAdapter(
  root: string,
  invocation = createTestProjectRunInvocation(root),
): ProjectWriteAdapter {
  return createProjectWriteAdapter(root, invocation);
}
