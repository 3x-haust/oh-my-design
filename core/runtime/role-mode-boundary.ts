import type { ProjectRunInvocation } from './invocation.ts';

type Boundary = Readonly<{ write(root: string, path: string, kind: 'file' | 'directory'): void; operation(args: readonly string[]): void }>;
const boundaries = new WeakMap<ProjectRunInvocation, Boundary>();
/** Separate from role/route parsing so the foundational project writer has no dependency cycle. */
export function attachRoleModeBoundary(invocation: ProjectRunInvocation, boundary: Boundary): void {
  if (boundaries.has(invocation)) throw new Error('ROLE_MODE: invocation already has an immutable role boundary');
  boundaries.set(invocation, Object.freeze(boundary));
}
export function enforceRoleModeWrite(root: string, invocation: ProjectRunInvocation, path: string, kind: 'file' | 'directory' = 'file'): void {
  boundaries.get(invocation)?.write(root, path, kind);
}
export function enforceRoleModeOperation(invocation: ProjectRunInvocation, args: readonly string[]): void {
  boundaries.get(invocation)?.operation(args);
}
