import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readContainedRegularFile } from '../ref/reference-selection.ts';

export class ArtifactDigestError extends Error {
  override readonly name = 'ArtifactDigestError';
}
export function artifactDigest(root: string, path: string) {
  const parts = path.split('/');
  if (parts[0] !== '.omd' || parts.length < 2 || path.includes('\\') || path.includes('\0')
    || parts.slice(1).some(part => !part || part === '..' || (part.startsWith('.') && part !== '.cache'))
    || parts[1] === 'activation') {
    throw new ArtifactDigestError('ARTIFACT_DIGEST_PATH: use a contained public .omd artifact, not authority files or traversal');
  }
  const bytes = readContainedRegularFile(root, join(root, path), path);
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
