import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { readTidyFile, requireTidyDigest, tidyHash } from './tidy-files.ts';
import { referenceTidyCandidates } from './tidy-plan.ts';

export type ReferenceTidyResult = Readonly<{
  schema: 'reference-tidy-v1';
  applied: boolean;
  planSha256: string;
  manifestPath: string | null;
  files: readonly Readonly<{ path: string; archivePath: string; sha256: string; bytes: number; reason: string }>[];
  revalidationRequired: boolean;
  guidance: string;
}>;

/** The CLI holds the project mutation lock across selection and this recoverable archive. */
export function tidyReferences(root: string, adapter?: ProjectWriteAdapter): ReferenceTidyResult {
  const candidates = referenceTidyCandidates(root);
  const plan = candidates.map(({ path, sha256, bytes, reason }) => ({ path, sha256, bytes: bytes.length, reason }));
  const planSha256 = tidyHash(JSON.stringify({ schema: 'reference-tidy-plan-v1', files: plan }));
  const directory = `.omd/archive/references/${planSha256}`;
  const files = plan.map(item => ({ ...item, archivePath: `${directory}/files/${item.path}` }));
  const manifestPath = files.length ? `${directory}/manifest.json` : null;
  const manifest = `${JSON.stringify({ schema: 'reference-tidy-archive-v1', planSha256, files }, null, 2)}\n`;
  if (adapter && files.length) {
    const writer = requireProjectWriteAdapter(root, adapter);
    // Preflight every source and existing archive before the first project mutation.
    for (const item of files) {
      requireTidyDigest(readTidyFile(root, item.path), item.sha256);
      if (existsSync(resolve(root, item.archivePath))) requireTidyDigest(readTidyFile(root, item.archivePath), item.sha256);
    }
    if (manifestPath && existsSync(resolve(root, manifestPath))) requireTidyDigest(readTidyFile(root, manifestPath), tidyHash(manifest));
    for (const [index, candidate] of candidates.entries()) {
      const item = files[index];
      if (item) writer.writeContentAddressed(item.archivePath, candidate.bytes);
    }
    if (manifestPath) writer.writeContentAddressed(manifestPath, manifest);
    // Explicit archive verification is the removal precondition, including resumed writes.
    for (const item of files) {
      requireTidyDigest(readTidyFile(root, item.archivePath), item.sha256);
      requireTidyDigest(readTidyFile(root, item.path), item.sha256);
    }
    if (manifestPath) requireTidyDigest(readTidyFile(root, manifestPath), tidyHash(manifest));
    for (const item of files) writer.remove(item.path);
  }
  return { schema: 'reference-tidy-v1', applied: adapter !== undefined, planSha256, manifestPath, files,
    revalidationRequired: files.length > 0,
    guidance: files.length ? 'Revalidate research, boards, selections and judgments after applying tidy; archived paths and hashes remain in the manifest. No judgment hashes are rewritten.' : 'No recognized reference clutter to archive.' };
}
