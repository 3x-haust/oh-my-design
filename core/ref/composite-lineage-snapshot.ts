import { readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';
import {
  CompositeLineageFileError,
  readTrustedBoardBytes,
  readTrustedSelectionBytes,
  trustedBoardPath,
  trustedComposite,
  trustedPrompt,
} from './composite-lineage-files.ts';
import { parseReferenceSelection } from './reference-selection.ts';

const STABLE_SNAPSHOT_ATTEMPTS = 3;
const fail = (reason: string): never => { throw new CompositeLineageFileError(reason); };

export type CurrentCompositeSelection = {
  readonly assemblySha256: string;
  readonly selectionSha256: string;
  readonly candidateId: string;
};

type LineageReaders = {
  readonly readBoardArtifacts: typeof readReferenceBoardArtifacts;
  readonly readBoardBytes: typeof readTrustedBoardBytes;
  readonly readSelectionBytes: typeof readTrustedSelectionBytes;
  readonly readComposite: typeof trustedComposite;
  readonly readPrompt: typeof trustedPrompt;
};

export type ReferenceCompositeLineageReaders = Partial<LineageReaders>;

const defaults: LineageReaders = {
  readBoardArtifacts: readReferenceBoardArtifacts,
  readBoardBytes: readTrustedBoardBytes,
  readSelectionBytes: readTrustedSelectionBytes,
  readComposite: trustedComposite,
  readPrompt: trustedPrompt,
};

export const resolveCompositeLineageReaders = (overrides?: ReferenceCompositeLineageReaders): LineageReaders => ({ ...defaults, ...overrides });

export const readStableCurrentCompositeSelection = (root: string, reader: LineageReaders): CurrentCompositeSelection => {
  for (let attempt = 0; attempt < STABLE_SNAPSHOT_ATTEMPTS; attempt += 1) {
    const selectionBefore = reader.readSelectionBytes(root);
    const boardBefore = reader.readBoardBytes(root);
    const selection = parseReferenceSelection(JSON.parse(selectionBefore.toString('utf8')));
    const artifacts = reader.readBoardArtifacts(root, trustedBoardPath(root));
    const selectionAfter = reader.readSelectionBytes(root);
    const boardAfter = reader.readBoardBytes(root);
    if (!selectionBefore.equals(selectionAfter) || !boardBefore.equals(boardAfter)) continue;
    if (selection.boardSha256 !== sha256(artifacts.boardBytes)) continue;
    if (selection.assemblySha256 !== sha256(artifacts.assemblyBytes)) continue;
    if (!artifacts.assembly.candidates.some((candidate) => candidate.id === selection.candidateId)) continue;
    return { assemblySha256: sha256(artifacts.assemblyBytes), selectionSha256: sha256(selectionBefore), candidateId: selection.candidateId };
  }
  return fail('could not obtain a stable selection and board snapshot');
};
