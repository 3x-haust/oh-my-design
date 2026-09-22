import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Deliberately small pre-production shell allowance. This is not a shell parser or OS sandbox.
 * Use read for file contents and omd_cli for research; interpreters/redirection can write source.
 */
export function isPreproductionReadCommand(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  const text = command.trim();
  if (/^(?:pwd|ls(?: -[alh]+)?|rg --files(?: --hidden)?|git (?:status(?: --short)?|diff(?: --stat)?|log -[1-9][0-9]* --oneline))$/.test(text)) return true;
  // A closed inventory grammar, NOT arbitrary shell pipelines/options. In particular no rg
  // --pre, substitutions, redirections, paths, newline commands or unquoted metacharacters.
  return /^(?:pwd && )?rg --files(?: --hidden)?(?: -g '(?:!?[a-zA-Z0-9_.*/-]+)')*(?: \| head (?:-n )?[1-9][0-9]{0,3}| \| head -[1-9][0-9]{0,3})?$/.test(text);
}

const OMD_MUTATING_ROOTS = /^(?:frame|domain|route|ref|copy|type|composition|slop|lifecycle|finalize|complete)$/;
const OMD_READ_ACTIONS = /^(?:show|check|validate|list|handoff|discover-plan|research-check|apply-plan|apply-check|apply-review-plan|apply-review-check|review-check|review-input)$/;
const OMD_MUTATING_PAIRS = new Set([
  'stage deliver', 'grain set', 'acquisition set', 'candidate select', 'judgment publish', 'benchmark record',
]);

export function isMutatingOmdCommand(args: readonly string[]): boolean {
  if (args.includes('--help') || args.includes('-h')) return false;
  if (args[0] === 'recipe' && args[1] === 'add') return true;
  if (OMD_MUTATING_PAIRS.has(`${args[0] ?? ''} ${args[1] ?? ''}`)) return true;
  return OMD_MUTATING_ROOTS.test(args[0] ?? '') && !OMD_READ_ACTIONS.test(args[1] ?? '');
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
      if (!(error instanceof Error && Reflect.get(error, 'code') === 'ENOENT')) {
        return { kind: 'blocked', path, reason: 'target cannot be inspected' };
      }
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
