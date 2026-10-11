import { PNG } from 'pngjs';
import { canonicalJson, readReferenceBoardArtifacts, sha256 } from '../ref/board-artifacts.ts';
import { validateReferenceSelectionV2 } from '../ref/reference-selection.ts';
import type { RouteRecord } from '../route/index.ts';
import { makerFail } from '../../adapters/pi-maker-contract.ts';
import { collectSelectedReferenceOriginals, referenceFidelityRequired } from './native-reference-fidelity.ts';
import type { MakerDocument } from './native-maker-context.ts';
import type { MakerRender } from './native-maker-visuals.ts';

const MAX_SELECTED_REFERENCE_ORIGINALS = 3;

export type SelectedReferenceMakerProjection = Readonly<{
  documents: readonly MakerDocument[];
  renders: readonly MakerRender[];
  lineage: readonly unknown[];
}>;

export function selectedReferenceMakerProjection(
  root: string,
  route: Pick<RouteRecord, 'strategy'>,
): SelectedReferenceMakerProjection {
  if (!referenceFidelityRequired(route.strategy)) {
    return Object.freeze({ documents: Object.freeze([]), renders: Object.freeze([]), lineage: Object.freeze([]) });
  }
  const originals = collectSelectedReferenceOriginals(root);
  const selection = validateReferenceSelectionV2(root);
  const artifacts = readReferenceBoardArtifacts(root);
  if (selection.captureSha256 !== sha256(artifacts.boardBytes)
    || selection.assemblySha256 !== sha256(artifacts.assemblyBytes)
    || selection.projectionSha256 !== sha256(artifacts.projectionBytes)) {
    return makerFail('selected-reference-snapshot-changed');
  }
  const candidate = artifacts.raw.candidates.find(row => row.id === selection.candidateId)
    ?? makerFail('selected-reference-candidate-missing');
  const pieces = new Map(candidate.pieces.map(piece => [piece.slotId, piece]));
  const unique = new Map<string, Readonly<{
    original: (typeof originals)[number];
    width: number;
    height: number;
  }>>();
  for (const original of originals) {
    const piece = pieces.get(original.slotId) ?? makerFail('selected-reference-slot-missing');
    if (piece.evidence.kind === 'classified-reference') makerFail('selected-reference-original-missing');
    if (piece.evidence.kind === 'image-fragment' && piece.evidence.cropBox !== undefined) {
      makerFail('selected-reference-original-not-whole');
    }
    const bytes = Buffer.from(original.pngBase64, 'base64');
    if (sha256(bytes) !== original.sha256 || original.sha256 !== piece.evidence.imageSha256) {
      makerFail('selected-reference-original-drift');
    }
    let png: PNG;
    try {
      png = PNG.sync.read(bytes);
    } catch {
      return makerFail('selected-reference-original-png');
    }
    if (png.width < 1 || png.height < 1) makerFail('selected-reference-original-dimensions');
    if (!unique.has(original.sha256)) unique.set(original.sha256,
      Object.freeze({ original, width: png.width, height: png.height }));
  }
  const selected = [...unique.values()].slice(0, MAX_SELECTED_REFERENCE_ORIGINALS);
  const labels = new Map(selected.map((row, index) =>
    [row.original.sha256, `selected-reference-original-${index + 1}.png`] as const));
  const renders = Object.freeze(selected.map((row): MakerRender => Object.freeze({
    role: 'selected-reference-original',
    path: labels.get(row.original.sha256) ?? makerFail('selected-reference-label'),
    captureSha256: row.original.sha256,
    width: row.width,
    height: row.height,
    pngBase64: row.original.pngBase64,
  })));
  const guidance = {
    schema: 'native-maker-selected-reference-guidance-v1',
    limits: {
      maximumOriginals: MAX_SELECTED_REFERENCE_ORIGINALS,
      selectedUniqueOriginals: unique.size,
      deliveredOriginals: renders.length,
      omittedOriginals: Math.max(0, unique.size - renders.length),
    },
    usageLimits: [
      'These whole originals are private observation evidence, not output assets.',
      'Do not ship, embed, re-encode, trace, crop, or otherwise reuse supplied pixels.',
      'Do not copy source text, branding, logos, names, or proprietary content.',
      'Use only the stated take, avoid, adaptation, task, and state limits; screenshots do not establish DOM, behavior, or destination capability.',
    ],
    references: originals.map(original => {
      const piece = pieces.get(original.slotId) ?? makerFail('selected-reference-slot-missing');
      const imagePath = labels.get(original.sha256) ?? null;
      return {
        imagePath,
        delivery: imagePath === null ? 'omitted-by-limit' : 'delivered',
        slotId: original.slotId,
        targetComponent: original.targetComponent,
        targetRoute: candidate.route,
        taskIds: [...piece.taskIds],
        stateLimit: piece.binding?.sourceState ?? null,
        take: [...original.take],
        avoid: original.avoid,
        adaptation: original.adaptation,
      };
    }),
  };
  const documents = Object.freeze<MakerDocument[]>([
    Object.freeze({ path: 'selected-reference-guidance.json', content: canonicalJson(guidance) }),
  ]);
  const lineage = Object.freeze([Object.freeze({
    kind: 'selected-reference-maker-evidence',
    deliveredOriginals: renders.length,
    omittedOriginals: guidance.limits.omittedOriginals,
    maximumOriginals: MAX_SELECTED_REFERENCE_ORIGINALS,
  })]);
  return Object.freeze({ documents, renders, lineage });
}
