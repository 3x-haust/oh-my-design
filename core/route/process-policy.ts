import { failAdaptiveRoute } from './adaptive-flow-domain.ts';

/** Omission means historical graph/ownership, never implicit autonomous permission. */
export type ProcessPolicy = Readonly<{
  schema: 'human-design-process-v1';
  interactionMode: 'interactive' | 'autonomous';
  autonomyGrant: Readonly<{ path: string; sha256: string }> | null;
}>;
export const INTERACTIVE_PROCESS_POLICY: ProcessPolicy = Object.freeze({
  schema: 'human-design-process-v1', interactionMode: 'interactive', autonomyGrant: null,
});
export function parseProcessPolicy(value: unknown): ProcessPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'processPolicy must be an object');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'autonomyGrant,interactionMode,schema' || v.schema !== 'human-design-process-v1'
    || !['interactive', 'autonomous'].includes(String(v.interactionMode))) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'invalid processPolicy');
  if (v.interactionMode === 'interactive') {
    if (v.autonomyGrant !== null) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'interactive direction does not use an autonomy grant');
    return INTERACTIVE_PROCESS_POLICY;
  }
  const r = v.autonomyGrant as Record<string, unknown> | null;
  if (!r || Object.keys(r).sort().join(',') !== 'path,sha256' || typeof r.path !== 'string'
    || !/^\.omd\/[A-Za-z0-9_./-]+$/.test(r.path) || r.path.split('/').some(s => s === '..' || s === '' || s === '.')
    || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)) return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'autonomous direction requires an explicit user/host grant receipt');
  return { schema: 'human-design-process-v1', interactionMode: 'autonomous', autonomyGrant: { path: r.path, sha256: r.sha256 } };
}
