import { createHash } from 'node:crypto';
import {
  InvocationValidationError,
  requireAdaptiveRouteAuthorityAuthorization,
  validateCurrentProjectRun,
  type ProjectRunInvocation,
} from '../runtime/invocation.ts';
import type { SelectedModelIdentity } from '../runtime/model-capability-profile.ts';
import { failAdaptiveRoute, type AdaptiveRouteRecord } from './adaptive-flow-domain.ts';
import { canonicalRouteJson } from './adaptive-source-contract.ts';

export const ADAPTIVE_ROUTE_AUTHORITY_SCHEMA = 'adaptive-route-authority-v1' as const;

export type AdaptiveRouteAuthority = Readonly<{
  schema: typeof ADAPTIVE_ROUTE_AUTHORITY_SCHEMA;
  invocation: Readonly<{
    buildSha256: string;
    loadedSkillSha256: string;
    briefSha256: string;
  }>;
  sourceSha256: string;
  routeSha256: string;
  selectedModel: SelectedModelIdentity;
  allowedPaths: readonly string[];
  namedDependencies: readonly string[];
}>;

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function adaptiveRouteAuthority(
  record: AdaptiveRouteRecord,
  routeSha256: string,
  invocation: ProjectRunInvocation,
): AdaptiveRouteAuthority {
  const activation = validateCurrentProjectRun(invocation);
  return Object.freeze({
    schema: ADAPTIVE_ROUTE_AUTHORITY_SCHEMA,
    invocation: Object.freeze({
      buildSha256: activation.buildSha256,
      loadedSkillSha256: activation.loadedSkillSha256,
      briefSha256: activation.briefSha256,
    }),
    sourceSha256: record.sourceContractSha256,
    routeSha256,
    selectedModel: record.selectedModel,
    allowedPaths: record.allowedPaths,
    namedDependencies: record.namedDependencies,
  });
}

export function adaptiveRouteAuthorityBytes(
  record: AdaptiveRouteRecord,
  routeSha256: string,
  invocation: ProjectRunInvocation,
): Buffer {
  return Buffer.from(`${canonicalRouteJson(adaptiveRouteAuthority(record, routeSha256, invocation))}\n`);
}

export function adaptiveRouteAuthorityPath(bytes: Uint8Array): string {
  return `route-authorities/sha256-${hash(bytes)}.json`;
}

export function requireAdaptiveRouteAuthority(
  root: string,
  invocation: ProjectRunInvocation,
  bytes: Uint8Array,
): void {
  try {
    requireAdaptiveRouteAuthorityAuthorization(invocation, root, bytes);
  } catch (error) {
    if (error instanceof InvocationValidationError) return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED');
    throw error;
  }
}
