import type { Invariants, RawIr, Reference } from '../types.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { canonicalJson } from './board-artifacts.ts';
import { normalize } from '../ir/normalize.ts';
import { extractInvariants } from './invariants.ts';
import { refIdentity } from './identity.ts';
import { loadRefs } from './store.ts';
import {
  readValidatedReferenceUsage,
  referenceUsageV2Sha256,
  type ValidatedReferenceUsage,
} from './reference-usage-snapshot.ts';
import {
  readReferenceSelectionV2,
  referenceSelectionV2Sha256,
  type ReferenceSelectionV2,
} from './reference-selection.ts';
import { readTrustedReferenceUsageSnapshot } from './reference-usage-files.ts';
import {
  SELECTED_REFERENCE_DISTANCE_PATH,
  SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION,
  SELECTED_REFERENCE_DISTANCE_THRESHOLD,
  SelectedReferenceDistanceError,
  failSelectedReferenceDistance as fail,
  parseSelectedReferenceDistanceReceipt,
  type SelectedReferenceDistanceReceipt,
  type SelectedReferenceDistanceSlotInput,
} from './selected-reference-distance-contract.ts';
import { createSelectedReferenceDistanceReceipt } from './selected-reference-distance-scoring.ts';
export {
  SELECTED_REFERENCE_DISTANCE_PATH,
  SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION,
  SELECTED_REFERENCE_DISTANCE_THRESHOLD,
  SelectedReferenceDistanceError,
  parseSelectedReferenceDistanceReceipt,
  selectedReferenceDistanceSha256,
  type CreateSelectedReferenceDistanceReceiptInput,
  type SelectedReferenceDistanceComparison,
  type SelectedReferenceDistanceReceipt,
  type SelectedReferenceDistanceSlotInput,
} from './selected-reference-distance-contract.ts';
export { createSelectedReferenceDistanceReceipt } from './selected-reference-distance-scoring.ts';

export type MeasureSelectedReferenceDistanceInput = Readonly<{
  target: string;
  viewport: Readonly<{ width: number; height: number }>;
  extract: (selector: string) => Promise<RawIr>;
  writer?: ProjectWriteAdapter;
}>;

type CurrentBindings = Readonly<{
  validatedUsage: ValidatedReferenceUsage;
  selection: ReferenceSelectionV2;
  candidateId: string;
  route: string;
  usageSha256: string;
  selectionSha256: string;
  buildSha256: string;
}>;

const selectedUsedPieces = (bindings: CurrentBindings) => {
  const selected = new Map(bindings.selection.slots.map((slot) => [slot.slotId, slot]));
  return bindings.validatedUsage.pieces.filter((piece) => (
    piece.usage.status === 'used'
    && selected.get(piece.usage.slotId)?.obligationDisposition === 'used'
  ));
};

const currentBindings = (root: string): CurrentBindings => {
  const validatedUsage = readValidatedReferenceUsage(root);
  const selection = readReferenceSelectionV2(root);
  const candidate = validatedUsage.artifacts.assembly.candidates.find(
    (entry) => entry.id === selection.candidateId,
  );
  if (candidate === undefined) fail('selected candidate is unavailable from current assembly');
  const currentCandidate = candidate as NonNullable<typeof candidate>;
  const builds = new Set(validatedUsage.usage.rows.map((row) => row.productionObservation.buildSha256));
  if (builds.size !== 1) fail('reference usage must bind exactly one production build');
  return {
    validatedUsage,
    selection,
    candidateId: currentCandidate.id,
    route: currentCandidate.route,
    usageSha256: referenceUsageV2Sha256(validatedUsage.usage),
    selectionSha256: referenceSelectionV2Sha256(selection),
    buildSha256: [...builds][0]!,
  };
};

const requireCurrentBindings = (root: string): CurrentBindings => {
  try {
    return currentBindings(root);
  } catch (error) {
    if (error instanceof SelectedReferenceDistanceError) throw error;
    return fail(`selected reference distance prerequisites are invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const referenceMap = (root: string): ReadonlyMap<string, Reference> => new Map(
  loadRefs(root).map((reference) => [refIdentity(reference.source, reference.component), reference]),
);

const sameViewport = (
  left: Readonly<{ width: number; height: number }> | undefined,
  right: Readonly<{ width: number; height: number }>,
): boolean => left?.width === right.width && left.height === right.height;

export async function measureSelectedReferenceDistance(
  root: string,
  input: MeasureSelectedReferenceDistanceInput,
): Promise<SelectedReferenceDistanceReceipt> {
  const bindings = requireCurrentBindings(root);
  const references = referenceMap(root);
  const targets = new Map<string, Promise<Invariants>>();
  const measuredTarget = (selector: string): Promise<Invariants> => {
    const current = targets.get(selector);
    if (current !== undefined) return current;
    const pending = input.extract(selector).then((raw) => extractInvariants(normalize(raw)));
    targets.set(selector, pending);
    return pending;
  };
  const used = selectedUsedPieces(bindings);
  if (used.length === 0) fail('selected reference distance requires at least one used slot');
  const slots = await Promise.all(used.map(async (piece): Promise<SelectedReferenceDistanceSlotInput> => {
    if (piece.raw.sourceKind !== 'component-capture') {
      return fail(`selected used slot ${piece.usage.slotId} is unmeasurable; use a component capture`);
    }
    const reference = references.get(piece.raw.referenceId);
    if (reference === undefined || reference.kind !== 'component' || reference.invariants === null) {
      return fail(`selected used slot ${piece.usage.slotId} has no measured component reference`);
    }
    if (reference.selector === undefined || reference.selector.trim() === '') {
      return fail(`selected used slot ${piece.usage.slotId} has no source selector`);
    }
    if (!sameViewport(reference.viewport, input.viewport)) {
      return fail(`selected used slot ${piece.usage.slotId} reference viewport does not match target viewport`);
    }
    return {
      slotId: piece.usage.slotId,
      referenceId: piece.raw.referenceId,
      sourceSelector: reference.selector,
      targetSelector: piece.raw.targetSelector,
      referenceInvariants: reference.invariants,
      targetInvariants: await measuredTarget(piece.raw.targetSelector),
    };
  }));
  const receipt = createSelectedReferenceDistanceReceipt({
    selectionSha256: bindings.selectionSha256,
    usageSha256: bindings.usageSha256,
    buildSha256: bindings.buildSha256,
    candidateId: bindings.candidateId,
    route: bindings.route,
    target: input.target,
    viewport: input.viewport,
    slots,
  });
  if (input.writer !== undefined) writeSelectedReferenceDistanceReceipt(root, receipt, input.writer);
  return receipt;
}

export function writeSelectedReferenceDistanceReceipt(
  root: string,
  receipt: SelectedReferenceDistanceReceipt,
  writer: ProjectWriteAdapter,
): SelectedReferenceDistanceReceipt {
  if (writer.projectRoot !== root) fail('selected reference distance writer must target the project root');
  const parsed = parseSelectedReferenceDistanceReceipt(receipt);
  writer.write(SELECTED_REFERENCE_DISTANCE_PATH, canonicalJson(parsed));
  return parsed;
}

export function readSelectedReferenceDistanceReceipt(
  root: string,
): SelectedReferenceDistanceReceipt {
  const snapshot = readTrustedReferenceUsageSnapshot(
    root,
    SELECTED_REFERENCE_DISTANCE_PATH,
    'selected reference distance',
  );
  try {
    return parseSelectedReferenceDistanceReceipt(JSON.parse(snapshot.bytes.toString('utf8')));
  } catch (error) {
    if (error instanceof SelectedReferenceDistanceError) throw error;
    return fail(`selected reference distance is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateSelectedReferenceDistanceReceipt(
  root: string,
): SelectedReferenceDistanceReceipt {
  const receipt = readSelectedReferenceDistanceReceipt(root);
  const bindings = requireCurrentBindings(root);
  if (receipt.selectionSha256 !== bindings.selectionSha256) fail('selected reference distance selection is stale');
  if (receipt.usageSha256 !== bindings.usageSha256) fail('selected reference distance usage is stale');
  if (receipt.buildSha256 !== bindings.buildSha256) fail('selected reference distance build is stale');
  if (receipt.candidateId !== bindings.candidateId) fail('selected reference distance candidate is stale');
  if (receipt.route !== bindings.route) fail('selected reference distance route is stale');
  const expected = selectedUsedPieces(bindings);
  if (receipt.comparisons.length !== expected.length) {
    fail('selected reference distance does not cover the exact used slot set');
  }
  const references = referenceMap(root);
  const comparisons = new Map(receipt.comparisons.map((comparison) => [comparison.slotId, comparison]));
  for (const piece of expected) {
    if (piece.raw.sourceKind !== 'component-capture') {
      fail(`selected used slot ${piece.usage.slotId} is unmeasurable; use a component capture`);
    }
    const reference = references.get(piece.raw.referenceId);
    const comparison = comparisons.get(piece.usage.slotId);
    if (reference === undefined) {
      fail(`selected used slot ${piece.usage.slotId} no longer has matching measured evidence`);
    }
    const currentReference = reference as Reference;
    if (currentReference.kind !== 'component' || currentReference.invariants === null
      || currentReference.selector === undefined || !sameViewport(currentReference.viewport, receipt.viewport)) {
      fail(`selected used slot ${piece.usage.slotId} no longer has matching measured evidence`);
    }
    if (comparison === undefined
      || comparison.referenceId !== piece.raw.referenceId
      || comparison.sourceSelector !== currentReference.selector
      || comparison.targetSelector !== piece.raw.targetSelector) {
      fail(`selected reference distance slot ${piece.usage.slotId} binding is stale`);
    }
  }
  return receipt;
}
