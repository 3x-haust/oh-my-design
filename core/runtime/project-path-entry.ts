import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';

/** Unlike existsSync, this keeps dangling symlinks visible to fail-closed readers. */
export function projectPathEntryExists(root: string, path: string): boolean {
  let current = root;
  for (const component of path.split('/').filter(Boolean)) {
    current = resolve(current, component);
    try {
      const entry = lstatSync(current);
      if (entry.isSymbolicLink()) return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  return true;
}
