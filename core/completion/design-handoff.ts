import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import { changedPathsForAdaptiveRoute } from '../route/adaptive-route-scope.ts';
import { completionLimitations } from './limitations.ts';
import { confidenceDebt, DEBT_CAPABLE_STAGES, mergeConfidenceDebt } from '../brief/confidence-debt.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import { STAGES } from '../stage/contract.ts';

export const DESIGN_HANDOFF_SCHEMA = 'design-handoff-v1' as const;
export const DESIGN_HANDOFF_PARTS = ['screen-map', 'state-model', 'ux-ui-direction', 'content', 'accessibility-trust', 'implementation-handoff', 'open-questions'] as const;
type Receipt = Readonly<{ path: string; sha256: string }>;
export type DesignHandoff = Readonly<{
  schema: typeof DESIGN_HANDOFF_SCHEMA;
  sourceContractSha256: string;
  artifacts: readonly (Receipt & { id: typeof DESIGN_HANDOFF_PARTS[number] })[];
  review: Receipt;
}>;
const fail = (detail: string): never => { throw new Error(`DESIGN_HANDOFF_INVALID: ${detail}`); };
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail(`${label} must be an object`);
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !fields[key]?.enumerable || !('value' in fields[key]!))) return fail(`${label} requires exactly ${keys.join(', ')}`);
  return value as Record<string, unknown>;
}
function receipt(input: Record<string, unknown>, label: string): Receipt {
  if (typeof input.path !== 'string' || !/^\.omd\/[a-zA-Z0-9_./-]+\.(md|json)$/.test(input.path)
    || input.path.split('/').slice(1).some((part) => !part || part === '.' || part === '..')
    || input.path.startsWith('.omd/activation/') || !sha(input.sha256)) return fail(`${label} needs a safe .omd document path and SHA-256`);
  return { path: input.path, sha256: input.sha256 };
}
export function parseDesignHandoff(value: unknown): DesignHandoff {
  const item = object(value, ['schema', 'sourceContractSha256', 'artifacts', 'review'], 'handoff');
  if (item.schema !== DESIGN_HANDOFF_SCHEMA || !sha(item.sourceContractSha256) || !Array.isArray(item.artifacts)
    || item.artifacts.length !== DESIGN_HANDOFF_PARTS.length) return fail('schema, source binding, or artifact inventory is invalid');
  const artifacts = item.artifacts.map((value, index) => {
    const part = object(value, ['id', 'path', 'sha256'], `artifacts[${index}]`);
    if (!DESIGN_HANDOFF_PARTS.includes(part.id as never)) return fail(`artifacts[${index}].id is unknown`);
    return { id: part.id as typeof DESIGN_HANDOFF_PARTS[number], ...receipt(part, `artifacts[${index}]`) };
  });
  const review = receipt(object(item.review, ['path', 'sha256'], 'review'), 'review');
  if (new Set(artifacts.map((part) => part.id)).size !== DESIGN_HANDOFF_PARTS.length
    || new Set([...artifacts.map((part) => part.path), review.path]).size !== artifacts.length + 1) return fail('every required part and the review need separate documents');
  return { schema: DESIGN_HANDOFF_SCHEMA, sourceContractSha256: item.sourceContractSha256, artifacts, review };
}

/** File integrity is inspectable locally; it is not proof of independent authorship or shipped UI. */
export function validateDesignHandoffArtifacts(root: string, route: AdaptiveRouteRecord, input: unknown) {
  const handoff = parseDesignHandoff(input);
  if (route.deliveryMode !== 'design-only' || handoff.sourceContractSha256 !== route.sourceContractSha256) return fail('handoff must bind the current design-only route');
  const fs = nodeStableProjectFileSystem();
  const read = (path: string) => readStableProjectFile({ root, path: resolve(root, path), label: path, fs });
  for (const part of [...handoff.artifacts, handoff.review]) {
    const bytes = read(part.path);
    if (bytes.toString('utf8').trim().length === 0 || createHash('sha256').update(bytes).digest('hex') !== part.sha256) return fail(`missing, empty, or stale document: ${part.path}`);
  }
  const limitations = [...completionLimitations(root, route).limitations];
  for (const stage of STAGES.filter((stage) => route.strategy.stages.includes(stage.id))) {
    try {
      if (!read(stage.artifact).toString('utf8').trim()) return fail(`selected stage has no output: ${stage.artifact}`);
    } catch (error) {
      if (!DEBT_CAPABLE_STAGES.has(stage.id)) throw error;
      limitations.push(confidenceDebt(stage.id, `Design evidence not verified: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return {
    schema: 'design-handoff-check-v1' as const,
    status: 'design-package-verified' as const,
    sourceContractSha256: route.sourceContractSha256,
    verification: limitations.length ? 'artifact-integrity-with-limitations' as const : 'artifact-integrity-and-reference-evidence' as const,
    limitations: mergeConfidenceDebt(limitations),
    review: { ...handoff.review, independence: 'not-attested' as const },
    implementation: 'not-performed' as const,
    artifacts: handoff.artifacts,
  };
}

export function checkDesignHandoff(root: string, input: unknown, invocation: ProjectRunInvocation) {
  const route = readPersistedRoute(root, invocation);
  if (route.deliveryMode !== 'design-only') return fail('implementation routes must use completion preflight');
  const changes = changedPathsForAdaptiveRoute(root, route, adaptiveRouteRecordSha256(route), invocation);
  if (changes.some((path) => !path.startsWith('.omd/'))) return fail('files outside .omd changed during design-only work');
  return validateDesignHandoffArtifacts(root, route, input);
}
