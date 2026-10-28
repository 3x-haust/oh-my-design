import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const sameFile = (left: Stats, right: Stats): boolean => left.dev === right.dev && left.ino === right.ino && left.size === right.size;
type Failure = (reason: string) => never;
const fail: Failure = reason => { throw new Error(reason); };
const rejectSymlinkAncestors = (root: string, path: string, label: string, reject: Failure): void => {
  const canonicalRoot = resolve(root);
  const rootStat = lstatSync(canonicalRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) reject(`${label} project root must be a non-symlink directory`);
  const relativePath = relative(canonicalRoot, resolve(path));
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${sep}`)) reject(`${label} escapes project root`);
  let ancestor = canonicalRoot;
  for (const part of relativePath.split(sep).slice(0, -1)) {
    ancestor = join(ancestor, part);
    const stat = lstatSync(ancestor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) reject(`${label} has a symbolic-link or non-directory ancestor`);
  }
};
export function readContainedRegularFile(root: string, relativePath: string, label: string, reject: Failure = fail): Buffer {
  const path = resolve(root, relativePath);
  const sample = (): { readonly bytes: Buffer; readonly stat: Stats } => {
    rejectSymlinkAncestors(root, path, label, reject);
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink()) return reject(`${label} must be a regular non-symlink file`);
    const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const opened = fstatSync(descriptor);
      if (!opened.isFile() || !sameFile(before, opened)) return reject(`${label} changed before it was opened`);
      const bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor);
      if (!after.isFile() || !sameFile(opened, after) || bytes.length !== after.size) return reject(`${label} changed while it was read`);
      rejectSymlinkAncestors(root, path, label, reject);
      const final = lstatSync(path);
      if (!final.isFile() || final.isSymbolicLink() || !sameFile(after, final)) return reject(`${label} changed while it was read`);
      return { bytes, stat: final };
    } finally {
      closeSync(descriptor);
    }
  };
  const first = sample();
  const second = sample();
  if (!sameFile(first.stat, second.stat) || !first.bytes.equals(second.bytes)) return reject(`${label} changed during final resampling`);
  return first.bytes;
}
