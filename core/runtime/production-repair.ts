import { canonicalJson } from '../ref/board-artifacts.ts';
import { adaptiveRouteRecordSha256, pathsOutsideScope, readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from './invocation.ts';

const SHA256 = /^[a-f0-9]{64}$/;
const fail = (message: string): never => { throw new Error(`LEGACY_PRODUCTION_REPAIR_INVALID:${message}`); };

/** Historical record reader retained only for protected reviewer/refinement verification. */
export function productionRepairReviewBytes(value: unknown): Buffer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('review');
  const record = Object.fromEntries(Object.entries(value));
  const keys = [
    'schema', 'observationPointerSha256', 'retentionPointerSha256',
    'beforeSha256', 'afterSha256', 'suggestedPaths', 'findingIds',
  ].sort();
  if (Object.keys(record).sort().join(',') !== keys.join(',')
    || record.schema !== 'production-repair-review-v1'
    || !['observationPointerSha256', 'retentionPointerSha256', 'beforeSha256', 'afterSha256']
      .every(key => typeof record[key] === 'string' && SHA256.test(record[key] as string))
    || !Array.isArray(record.suggestedPaths)
    || !Array.isArray(record.findingIds)) {
    return fail('review');
  }
  return Buffer.from(`${canonicalJson(record)}\n`);
}

export function validateCommittedProductionRepairScope(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  routeSha256: string;
  sliceSha256: string;
  path: string;
  beforeTreeSha256: string;
}>): void {
  const route = readPersistedRoute(input.root, input.invocation);
  if (adaptiveRouteRecordSha256(route) !== input.routeSha256
    || !SHA256.test(input.sliceSha256)
    || !SHA256.test(input.beforeTreeSha256)
    || pathsOutsideScope(route, [input.path]).length > 0) {
    fail('scope');
  }
}
