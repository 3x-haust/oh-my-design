import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Deliberately small pre-production shell allowance. This is not a shell parser or OS sandbox.
 * Use read for file contents and omd_cli for research; interpreters/redirection can write source.
 */
export function isPreproductionReadCommand(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  return /^(?:pwd|ls(?: -[alh]+)?|rg --files(?: --hidden)?|git (?:status(?: --short)?|diff(?: --stat)?|log -[1-9][0-9]* --oneline))$/.test(command.trim());
}

export type WriteClassification = { kind: 'authoring' | 'production' | 'blocked'; path: string; reason?: string };

export function classifyPiWrite(root: string, input: unknown): WriteClassification {
  if (typeof input !== 'string' || !input || input.includes('\0')) {
    return { kind: 'blocked', path: '', reason: 'write/edit requires a concrete project file path' };
  }
  const absolute = resolve(root, input);
  const path = relative(resolve(root), absolute).split(sep).join('/');
  if (!path || isAbsolute(path) || path === '..' || path.startsWith('../')) {
    return { kind: 'blocked', path, reason: 'target escapes the project' };
  }
  let current = resolve(root);
  for (const segment of path.split('/')) {
    current = join(current, segment);
    // lstat also catches dangling symlinks, unlike existsSync.
    try {
      if (lstatSync(current).isSymbolicLink()) return { kind: 'blocked', path, reason: 'symlink write target/ancestor is not permitted' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { kind: 'blocked', path, reason: 'target cannot be inspected' };
    }
  }
  if (!path.startsWith('.omd/')) return { kind: 'production', path };
  // Inputs and directly authored documents only. CLI-owned pointers, authority, research receipts,
  // check history, final evidence, and locks cannot be hand-written to make a gate turn green.
  if (/^\.omd\/(?:\.cache\/|docs\/)/.test(path)
    || /^\.omd\/(?:domain-brief\.json|locale-design-context\.json|design-handoff\.json|scout\.md|copy-deck\.md|type-proof\.md|composition\.md|design-system-decisions\.md|tokens\.json)$/.test(path)) {
    return { kind: 'authoring', path };
  }
  return { kind: 'blocked', path, reason: 'CLI-owned design record; write an input under .omd/.cache and use its OMD publisher' };
}

export const hasPiRoute = (root: string): boolean => existsSync(join(root, '.omd/route.json'));
