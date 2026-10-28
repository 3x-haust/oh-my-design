import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

export function loadDeveloperImagePair(root: string, value: unknown, reversed: boolean) {
  if (!Array.isArray(value) || value.length !== 2
    || !value.every((path): path is string => typeof path === 'string' && path.length > 0)) {
    throw new Error('OMD_DEVELOPER_IMAGES_REQUIRED: expected two PNG paths');
  }
  const images = (reversed ? [...value].reverse() : value).map(path => {
    const absolute = resolve(root, path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) {
      throw new Error('OMD_DEVELOPER_IMAGE_INVALID');
    }
    const bytes = readFileSync(absolute);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error('OMD_DEVELOPER_IMAGE_INVALID');
    }
    PNG.sync.read(bytes);
    return { path: absolute, sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
  });
  const [a, b] = images;
  if (a === undefined || b === undefined) throw new Error('OMD_DEVELOPER_IMAGES_REQUIRED');
  return { a, b };
}
