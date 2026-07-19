import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refIdentity } from './identity.ts';
import { validatedImageFragmentPiece } from './board-fragment.ts';
import { persistedImageFragmentResolver } from './image-fragment.ts';
import { parseReferenceBoard } from './board-parser.ts';
import {
  ReferenceBoardResolutionError,
  type ImageFragmentResolver,
  type ReferenceBoardManifest,
  type ReferenceBoardPiece,
  type ResolvedComponentCapturePiece,
  type ResolvedReferenceBoard,
  type ResolvedReferenceBoardCandidate,
  type ResolvedReferenceBoardPiece,
} from './board-contract.ts';
import { trustedComponentCaptureImage } from './board-security.ts';
import { loadRefs } from './store.ts';
import { componentCaptureTransfer } from './board-transfer.ts';
import type { Reference } from '../types.ts';

export * from './board-contract.ts';
export { projectReferenceAssembly } from './board-projection.ts';
export type { ReferenceAssembly, ReferenceAssemblyPiece } from './board-projection.ts';

const fail = (reason: string): never => { throw new ReferenceBoardResolutionError(reason); };
const referenceFor = (references: ReadonlyMap<string, Reference>, referenceId: string): Reference => {
  const reference = references.get(referenceId);
  if (reference === undefined) throw new ReferenceBoardResolutionError(`reference ${referenceId} does not exist`);
  return reference;
};
const componentPiece = (root: string, piece: Extract<ReferenceBoardPiece, { readonly sourceKind: 'component-capture' }>, references: ReadonlyMap<string, Reference>): ResolvedComponentCapturePiece => {
  const reference = referenceFor(references, piece.referenceId);
  if (reference.kind !== 'component') fail(`reference ${piece.referenceId} must be a component capture`);
  if (reference.selector === undefined || reference.selector.trim() === '') fail(`reference ${piece.referenceId} is missing its selector`);
  if (reference.blueprint === undefined || reference.blueprint.selector !== reference.selector) fail(`reference ${piece.referenceId} is missing a matching blueprint`);
  const imagePath = reference.imagePath;
  if (imagePath === undefined || imagePath.trim() === '') throw new ReferenceBoardResolutionError(`reference ${piece.referenceId} is missing its imagePath`);
  return { ...piece, reference, imagePath: trustedComponentCaptureImage(root, imagePath), transfer: componentCaptureTransfer(reference, piece.referenceId) };
};
const referencesByIdentity = (root: string): ReadonlyMap<string, Reference> => {
  const references = new Map<string, Reference>();
  for (const reference of loadRefs(root)) {
    const identity = refIdentity(reference.source, reference.component);
    if (references.has(identity)) fail(`reference identity ${identity} is ambiguous`);
    references.set(identity, reference);
  }
  return references;
};
const resolvePiece = (root: string, piece: ReferenceBoardPiece, references: ReadonlyMap<string, Reference>, imageFragments: ImageFragmentResolver): ResolvedReferenceBoardPiece => {
  switch (piece.sourceKind) {
    case 'component-capture': return componentPiece(root, piece, references);
    case 'image-fragment': return validatedImageFragmentPiece(root, piece, imageFragments.resolve(root, piece));
  }
};

export function resolveReferenceBoard(root: string, manifest: ReferenceBoardManifest, imageFragments: ImageFragmentResolver = persistedImageFragmentResolver): ResolvedReferenceBoard {
  const references = referencesByIdentity(root);
  const candidates: ResolvedReferenceBoardCandidate[] = manifest.candidates.map((candidate) => ({ ...candidate, pieces: candidate.pieces.map((piece) => resolvePiece(root, piece, references, imageFragments)) }));
  return { schemaVersion: manifest.schemaVersion, frameSha256: manifest.frameSha256, candidates };
}

export function loadReferenceBoard(root: string, manifestPath = join(root, '.omd', 'reference-board.json')): ResolvedReferenceBoard {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { fail(`manifest ${manifestPath} is missing or invalid JSON`); }
  return resolveReferenceBoard(root, parseReferenceBoard(raw));
}
