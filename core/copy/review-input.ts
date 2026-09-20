import { join } from 'node:path';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { copyDeckSha256 } from './index.ts';

/** One read binds the reviewer's actual input to its digest, without granting a verdict. */
export function copyReviewInput(root: string) {
  const path = '.omd/copy-deck.md';
  const bytes = readContainedRegularFile(root, join(root, path), path);
  return { schema: 'copy-review-input-v1', path, sha256: copyDeckSha256(bytes),
    byteLength: bytes.length, content: bytes.toString('utf8') };
}
