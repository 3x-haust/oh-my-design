import { realpathSync } from 'node:fs';
import type { ProjectRunInvocation } from './invocation.ts';
import { validateCurrentProjectRun } from './invocation.ts';
import { verifyNativeObservation } from './self-signed-activation.ts';
import * as v from '../brief/candidate-data.ts';
import { requireCandidateSourcePlan } from '../brief/candidate-plan.ts';
import { attachRoleModeBoundary } from './role-mode-boundary.ts';
import { pathsOutsideScope, readPersistedRoute } from '../route/index.ts';

export type RoleModeGrant = Readonly<{ schema: 'role-mode-grant-v1'; projectRoot: string;
  role: 'omd-hand' | 'omd-sketch' | 'omd-art-director'; mode: 'source' | 'observer' | 'structural' | 'visual-study' | 'direction';
  buildSha256: string; briefSha256: string; sourceContractSha256: string; sourceDirectory: string | null; signature: string }>;
const attached = new WeakMap<ProjectRunInvocation, RoleModeGrant>();
const OBSERVER_STORES = ['.omd/visual-measurements', '.omd/visual-measurement-captures', '.omd/visual-measurement-ir',
  '.omd/captures', '.omd/observations', '.omd/task-evidence-runs', '.omd/slop', '.omd/observation-v2'] as const;
const OBSERVER_POINTERS = ['.omd/visual-measurement.json', '.omd/task-evidence.json', '.omd/observation-v2.json'] as const;
const observerCache = /^\.omd\/\.cache\/(?:renders?|measure[^/]*|probe[^/]*|task-evidence[^/]*|slop[^/]*)(?:\/|[.-]|$)/;

/** Host-only attachment: the grant must be signed at the actual role launch, never inferred from
 * a prompt, CLI --mode flag or mutable environment. There is deliberately no grant-signing CLI. */
export function bindRoleModeInvocation(root: string, invocation: ProjectRunInvocation, value: unknown): RoleModeGrant {
  validateCurrentProjectRun(invocation);
  const x = v.object(value, ['schema', 'projectRoot', 'role', 'mode', 'buildSha256', 'briefSha256', 'sourceContractSha256', 'sourceDirectory', 'signature']);
  const grant: RoleModeGrant = Object.freeze({ schema: v.enumeration(x.schema, ['role-mode-grant-v1']), projectRoot: v.text(x.projectRoot),
    role: v.enumeration(x.role, ['omd-hand', 'omd-sketch', 'omd-art-director']), mode: v.enumeration(x.mode, ['source', 'observer', 'structural', 'visual-study', 'direction']),
    buildSha256: v.sha(x.buildSha256), briefSha256: v.sha(x.briefSha256), sourceContractSha256: v.sha(x.sourceContractSha256),
    sourceDirectory: x.sourceDirectory === null ? null : v.path(x.sourceDirectory), signature: v.text(x.signature) });
  const { signature, ...payload } = grant;
  if (grant.projectRoot !== realpathSync(root) || grant.buildSha256 !== invocation.current.buildSha256 || grant.briefSha256 !== invocation.current.briefSha256
    || !verifyNativeObservation(grant.projectRoot, grant.schema, v.digest(payload), signature)) v.fail('role mode needs actual current host authority');
  if (grant.role === 'omd-hand' ? !['source', 'observer'].includes(grant.mode) || grant.sourceDirectory !== null
    : grant.role === 'omd-art-director' ? grant.mode !== 'direction' || grant.sourceDirectory !== null
      : !['structural', 'visual-study'].includes(grant.mode) || !/^\.omd\/\.cache\/sketches\/[^/]+$/.test(grant.sourceDirectory ?? '')) v.fail('role/mode/source grant mismatch');
  const prior = attached.get(invocation);
  if (prior && v.digest(prior) !== v.digest(grant)) v.fail('role mode cannot be switched within an invocation');
  if (prior) return prior;
  attached.set(invocation, grant);
  attachRoleModeBoundary(invocation, { write: (project, path, kind) => assertRoleModeWrite(project, invocation, path, kind), operation: args => assertRoleModeOperation(invocation, args) });
  return grant;
}
export function assertRoleModeWrite(root: string, invocation: ProjectRunInvocation, relativePath: string, kind: 'file' | 'directory' = 'file'): void {
  const grant = attached.get(invocation); if (!grant) return; // Explicit historical/unattached host behavior is retained.
  const path = v.path(relativePath);
  const routePointer = v.object(JSON.parse(v.readBytes(root, '.omd/route-source.json').toString('utf8')));
  if (grant.projectRoot !== realpathSync(root) || routePointer.sha256 !== grant.sourceContractSha256) v.fail('role grant belongs to stale route');
  if (grant.role === 'omd-hand' && grant.mode === 'observer') {
    const evidence = (OBSERVER_POINTERS as readonly string[]).includes(path) || observerCache.test(path)
      || OBSERVER_STORES.some(store => path.startsWith(`${store}/`) || kind === 'directory' && path === store);
    if (!evidence) v.fail('observer is production-read-only and may publish only native observation records');
  } else if (grant.role === 'omd-hand') {
    if (path.startsWith('.omd/') && !path.startsWith('.omd/.cache/')) v.fail('source mode cannot publish observation or owner records');
    if (!path.startsWith('.omd/')) {
      const route = readPersistedRoute(root, invocation);
      const parent = kind === 'directory' && route.allowedPaths.some(allowed => allowed.startsWith(`${path}/`));
      if (!parent && pathsOutsideScope(route, [path]).length) v.fail('source mode writes only routed production paths');
    }
  } else if (grant.role === 'omd-sketch') {
    if (!path.startsWith(`${grant.sourceDirectory}/`)) v.fail('Sketch writes only its assigned source directory');
    requireCandidateSourcePlan(root, path, grant.sourceContractSha256);
  } else if (path !== '.omd/tokens.json' && !path.startsWith('.omd/.cache/art-direction/')
    && !/^\.omd\/\.cache\/sketches\/(?:plan-input|content-input)[^/]*\.json$/.test(path)) v.fail('Art Director cannot write candidate source or current pointers');
}
export function assertRoleModeOperation(invocation: ProjectRunInvocation, args: readonly string[]): void {
  const grant = attached.get(invocation); if (!grant || grant.role !== 'omd-hand') return;
  const observer = ['render', 'ir', 'measure', 'probe', 'flow-probe', 'evidence', 'slop', 'first-render'];
  if (grant.mode === 'source' && observer.includes(args[0] ?? '')) v.fail('source mode returns source for observer evidence');
  if (grant.mode === 'observer' && ![...observer, 'check', 'source', 'brief', 'schema', 'pack', 'route'].includes(args[0] ?? '')) v.fail('observer cannot mutate source/owner artifacts or launch independent review');
}
export function attachedRoleMode(invocation: ProjectRunInvocation) { return attached.get(invocation) ?? null; }
