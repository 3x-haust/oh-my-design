import { fileURLToPath } from 'node:url';
import { authorizeTestPayloads, createLocalCliInvocation, type TestPayloadAuthorization } from '../../core/runtime/activation.ts';
import type { ProjectRunInvocation } from '../../core/runtime/invocation.ts';
import { createProjectWriteAdapter, type ProjectWriteAdapter } from '../../core/runtime/project-write.ts';

const CLI_PATH = fileURLToPath(new URL('../../bin/omd.ts', import.meta.url));

/** Creates a Node-test-runner-bound project-write invocation for a temporary project root. */
export function createTestProjectRunInvocation(root: string, brief?: unknown): ProjectRunInvocation {
  return createLocalCliInvocation({ cliPath: CLI_PATH, argv: [], projectRoot: root, brief });
}
export function authorizeTestProjectRunPayloads(root: string, invocation: ProjectRunInvocation, authorizations: readonly TestPayloadAuthorization[]): void {
  authorizeTestPayloads(invocation, root, authorizations);
}

/** Creates a Node-test-runner-bound project-write adapter for direct API test fixtures. */
export function createTestProjectWriteAdapter(root: string): ProjectWriteAdapter {
  return createProjectWriteAdapter(root, createTestProjectRunInvocation(root));
}
