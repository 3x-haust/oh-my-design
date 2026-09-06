import { fileURLToPath } from 'node:url';
import { authorizeTestPayloads, createLocalCliInvocation, type TestPayloadAuthorization } from '../../core/runtime/activation.ts';
import type { ProjectRunInvocation } from '../../core/runtime/invocation.ts';
import { createProjectWriteAdapter, type ProjectWriteAdapter } from '../../core/runtime/project-write.ts';
import {
  adaptiveRouteAuthorityBytes,
  adaptiveRouteRecordSha256,
  publishAdaptiveRoute,
  routeAdaptiveFlow,
} from '../../core/route/index.ts';

const CLI_PATH = fileURLToPath(new URL('../../bin/omd.ts', import.meta.url));

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
