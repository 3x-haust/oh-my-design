import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Reference } from '../types.ts';
import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';
import { assertValidReferencePngBytes } from './board-security.ts';
import { isNearUniformBlankCapture } from './blank-capture.ts';
import { sha256 } from './board-artifacts.ts';
import { refIdentity } from './identity.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { prepareReferenceRecord, refImagePath } from './store.ts';

const DIRECTORY = '.omd/discovery/design/candidates';
const fail = (code: string): never => { throw new Error(code); };
export type DesignCandidate = Readonly<{
  reference: Reference;
  capture: Buffer;
  image: Buffer;
  capturePath: string;
  imagePath: string;
}>;

function expectedImagePath(root: string, reference: Reference): string {
  return relative(root, refImagePath(root, reference)).split('\\').join('/');
}

export function stageDesignCandidate(root: string, reference: Reference, image: Buffer,
  writer: ProjectWriteAdapter): Readonly<{ path: string; imagePath: string }> {
  if (reference.researchLane !== 'design' || reference.imagePath !== expectedImagePath(root, reference)
    || reference.acquisition?.imageSha256 !== sha256(image)) fail('REFERENCE_CANDIDATE_INVALID');
  assertValidReferencePngBytes(image);
  if (reference.kind === 'page' && isNearUniformBlankCapture(image))
    fail('REFERENCE_CAPTURE_BLANK: blank full-viewport design capture');
  const prepared = prepareReferenceRecord(root, reference);
  const capturePath = `${DIRECTORY}/sha256-${sha256(prepared.bytes)}.json`;
  const imagePath = `${DIRECTORY}/sha256-${sha256(image)}.png`;
  const adapter = requireProjectWriteAdapter(root, writer);
  adapter.mkdir(DIRECTORY);
  adapter.writeContentAddressed(imagePath, image);
  adapter.writeContentAddressed(capturePath, prepared.bytes);
  return { path: capturePath, imagePath };
}

export function loadDesignCandidates(root: string): readonly DesignCandidate[] {
  const directory = join(root, DIRECTORY);
  if (!existsSync(directory)) return [];
  const candidates: DesignCandidate[] = [];
  for (const file of readdirSync(directory).filter(name => /^sha256-[a-f0-9]{64}\.json$/.test(name)).sort()) {
    const capturePath = `${DIRECTORY}/${file}`;
    const capture = readContainedRegularFile(root, capturePath, 'design candidate record');
    if (sha256(capture) !== file.slice(7, -5)) fail('REFERENCE_CANDIDATE_FORGED');
    let reference: Reference;
    try { reference = JSON.parse(capture.toString('utf8')) as Reference; }
    catch { return fail('REFERENCE_CANDIDATE_FORGED'); }
    if (!reference || reference.researchLane !== 'design' || typeof reference.source !== 'string'
      || typeof reference.component !== 'string' || !reference.imagePath
      || !reference.acquisition || typeof reference.acquisition.imageSha256 !== 'string')
      return fail('REFERENCE_CANDIDATE_FORGED');
    if (reference.imagePath !== expectedImagePath(root, reference)) return fail('REFERENCE_CANDIDATE_FORGED');
    const prepared = prepareReferenceRecord(root, reference);
    if (!prepared.bytes.equals(capture)) fail('REFERENCE_CANDIDATE_FORGED');
    const imagePath = `${DIRECTORY}/sha256-${reference.acquisition.imageSha256}.png`;
    const image = readContainedRegularFile(root, imagePath, 'design candidate original PNG');
    if (sha256(image) !== reference.acquisition.imageSha256) fail('REFERENCE_CANDIDATE_FORGED');
    assertValidReferencePngBytes(image);
    candidates.push({ reference, capture, image, capturePath, imagePath });
  }
  return candidates.sort((a, b) => a.reference.capturedAt.localeCompare(b.reference.capturedAt)
    || refIdentity(a.reference.source, a.reference.component).localeCompare(refIdentity(b.reference.source, b.reference.component)));
}

/** The staged JSON is exactly the final record; only the signed Eye decision can authorize publication. */
export function promoteDesignCandidate(root: string, candidate: DesignCandidate,
  writer: ProjectWriteAdapter): () => void {
  const adapter = requireProjectWriteAdapter(root, writer);
  const prepared = prepareReferenceRecord(root, candidate.reference);
  if (!prepared.bytes.equals(candidate.capture) || candidate.reference.imagePath !== expectedImagePath(root, candidate.reference))
    fail('REFERENCE_CANDIDATE_FORGED');
  const recordPath = prepared.path;
  const imagePath = candidate.reference.imagePath;
  if (!imagePath) return fail('REFERENCE_CANDIDATE_INVALID');
  const previousRecord = existsSync(join(root, recordPath)) ? readContainedRegularFile(root, recordPath, 'previous design reference') : null;
  const previousImage = existsSync(join(root, imagePath)) ? readContainedRegularFile(root, imagePath, 'previous design PNG') : null;
  const restore = () => {
    if (previousRecord === null) {
      if (existsSync(join(root, recordPath))) adapter.remove(recordPath);
    }
    else adapter.write(recordPath, previousRecord);
    if (previousImage === null) {
      if (existsSync(join(root, imagePath))) adapter.remove(imagePath);
    }
    else adapter.write(imagePath, previousImage);
  };
  adapter.mkdir('.omd/refs/design');
  try {
    adapter.write(imagePath, candidate.image);
    adapter.write(recordPath, candidate.capture);
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}
