import { canonicalJson, readReferenceBoardArtifacts, sha256, type RawBoardEvidence } from './board-artifacts.ts';
import type { ComponentCaptureTransfer } from './board-contract.ts';
import type { ReferenceAssemblyPiece } from './board-projection.ts';
import { parseReferenceSelectionV2, readContainedRegularFile, referenceSelectionV2Sha256, type ReferenceSelectionV2 } from './reference-selection.ts';

export const REFERENCE_VISUAL_PACKET_SCHEMA = 'reference-visual-packet-v1' as const;
export const REFERENCE_VISUAL_PACKET_EVIDENCE_SCHEMA = 'reference-visual-packet-evidence-v1' as const;
export const GEOMETRY_NEUTRALIZATION_SCHEMA = 'geometry-neutralization-v1' as const;

const DROPPED = ['color', 'copy', 'identity', 'imagery', 'typeface'] as const;
const PRESERVED = ['box-proportion', 'grouping', 'nesting', 'whitespace'] as const;
const GEOMETRY_AXES = new Set(['structure', 'proportion', 'density', 'rhythm']);

type PacketEntry = {
  readonly slotId: string;
  readonly axis: string;
  readonly zoneId: string;
  readonly decisionId: string;
  readonly targetSelector: string;
  readonly targetViewports: readonly { readonly width: number; readonly height: number }[];
  readonly artifact: {
    readonly path: string;
    readonly sha256: string;
    readonly mimeType: 'image/svg+xml';
  };
  readonly sanitizer: {
    readonly schema: typeof GEOMETRY_NEUTRALIZATION_SCHEMA;
    readonly dropped: typeof DROPPED;
    readonly preserved: typeof PRESERVED;
    readonly nodeCount: number;
  };
};

export type ReferenceVisualPacket = {
  readonly schema: typeof REFERENCE_VISUAL_PACKET_SCHEMA;
  readonly assemblySha256: string;
  readonly selectionSha256: string;
  readonly candidateId: string;
  readonly noShip: true;
  readonly sourceFree: true;
  readonly entries: readonly PacketEntry[];
};

export type ReferenceVisualPacketEvidence = {
  readonly schema: typeof REFERENCE_VISUAL_PACKET_EVIDENCE_SCHEMA;
  readonly packetSha256: string;
  readonly assemblySha256: string;
  readonly selectionSha256: string;
  readonly candidateId: string;
  readonly entries: readonly {
    readonly slotId: string;
    readonly referenceId: string;
    readonly sourceCaptureSha256: string;
    readonly blueprintSha256: string;
    readonly artifactPath: string;
    readonly artifactSha256: string;
  }[];
};

export type ReferenceVisualPacketBundle = {
  readonly packet: ReferenceVisualPacket;
  readonly evidence: ReferenceVisualPacketEvidence;
  readonly assets: ReadonlyMap<string, string>;
};

export class ReferenceVisualPacketError extends Error {
  override readonly name = 'ReferenceVisualPacketError';
}

const fail = (reason: string): never => { throw new ReferenceVisualPacketError(`reference visual packet is invalid: ${reason}`); };
const round = (value: number): number => Math.round(value * 100) / 100;
const attr = (value: number): string => String(round(Math.max(0, value)));

type BlueprintNode = Extract<ReferenceAssemblyPiece['transfer'], { blueprint: unknown }>['blueprint']['nodes'][number];
type Placed = { readonly index: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly depth: number };
const isComponentCaptureTransfer = (value: ReferenceAssemblyPiece['transfer']): value is ComponentCaptureTransfer => 'blueprint' in value;
const isComponentCaptureEvidence = (value: RawBoardEvidence): value is Extract<RawBoardEvidence, { kind: 'component-capture' }> => value.kind === 'component-capture';
const requireComponentCaptureTransfer = (value: ReferenceAssemblyPiece['transfer'], slotId: string): ComponentCaptureTransfer => isComponentCaptureTransfer(value) ? value : fail(`slot ${slotId} has no measured component blueprint`);
const requireComponentCaptureEvidence = (value: RawBoardEvidence, slotId: string): Extract<RawBoardEvidence, { kind: 'component-capture' }> => isComponentCaptureEvidence(value) ? value : fail(`slot ${slotId} has no measured component capture`);

function placeBlueprint(nodes: readonly BlueprintNode[]): readonly Placed[] {
  if (nodes.length < 3) fail('geometry neutralization requires at least three measured nodes');
  const placed: Placed[] = [];
  const active = new Set<number>();
  const visited = new Set<number>();
  const visit = (index: number, x: number, y: number, width: number, height: number, depth: number): void => {
    if (active.has(index)) fail('blueprint contains a cycle');
    if (visited.has(index)) return;
    if (nodes[index] === undefined) fail('blueprint contains an unknown node index');
    const node = nodes[index]!;
    active.add(index); visited.add(index);
    placed.push({ index, x: round(x), y: round(y), width: round(Math.max(1, width)), height: round(Math.max(1, height)), depth });
    const children = node.children.map((child) => nodes[child] ?? fail('blueprint child is missing'));
    if (children.length > 0) {
      const [paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0] = node.padding ?? [0, 0, 0, 0];
      const scaleX = width / Math.max(1, node.box.w); const scaleY = height / Math.max(1, node.box.h);
      const top = Math.min(height * .2, paddingTop * scaleY); const right = Math.min(width * .2, paddingRight * scaleX);
      const bottom = Math.min(height * .2, paddingBottom * scaleY); const left = Math.min(width * .2, paddingLeft * scaleX);
      const innerX = x + left; const innerY = y + top;
      const innerW = Math.max(1, width - left - right); const innerH = Math.max(1, height - top - bottom);
      const sumW = children.reduce((sum, child) => sum + Math.max(1, child.box.w), 0);
      const sumH = children.reduce((sum, child) => sum + Math.max(1, child.box.h), 0);
      const horizontalError = Math.abs(sumW - node.box.w) / Math.max(1, node.box.w);
      const verticalError = Math.abs(sumH - node.box.h) / Math.max(1, node.box.h);
      const horizontal = horizontalError <= verticalError;
      const gap = Math.min(horizontal ? innerW : innerH, Math.max(2, (node.gap ?? 6) * (horizontal ? scaleX : scaleY)));
      const distributable = Math.max(1, (horizontal ? innerW : innerH) - gap * Math.max(0, children.length - 1));
      let cursor = horizontal ? innerX : innerY;
      for (let childOffset = 0; childOffset < children.length; childOffset += 1) {
        const child = children[childOffset]!; const childIndex = node.children[childOffset]!;
        if (horizontal) {
          const childW = distributable * Math.max(1, child.box.w) / sumW;
          const childH = Math.min(innerH, innerH * Math.max(1, child.box.h) / Math.max(1, node.box.h));
          visit(childIndex, cursor, innerY, childW, childH, depth + 1); cursor += childW + gap;
        } else {
          const childH = distributable * Math.max(1, child.box.h) / sumH;
          const childW = Math.min(innerW, innerW * Math.max(1, child.box.w) / Math.max(1, node.box.w));
          visit(childIndex, innerX, cursor, childW, childH, depth + 1); cursor += childH + gap;
        }
      }
    }
    active.delete(index);
  };
  visit(0, 20, 20, 920, 560, 0);
  if (visited.size !== nodes.length) fail('blueprint contains unreachable nodes');
  return placed;
}

function geometrySvg(nodes: readonly BlueprintNode[]): string {
  const placed = placeBlueprint(nodes);
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600" aria-hidden="true" focusable="false">',
    '<rect width="960" height="600" fill="#f2f1ed"/>',
  ];
  for (const item of placed) {
    const node = nodes[item.index]!; const inset = Math.min(2, item.width / 8, item.height / 8);
    const x = item.x + inset; const y = item.y + inset; const width = Math.max(1, item.width - inset * 2); const height = Math.max(1, item.height - inset * 2);
    if (node.role === 'text' || node.role === 'heading') {
      const thickness = Math.max(3, Math.min(height * .42, node.role === 'heading' ? 18 : 10));
      const length = node.textLength === 'paragraph' ? .88 : node.textLength === 'phrase' ? .68 : .42;
      lines.push(`<rect x="${attr(x)}" y="${attr(y + (height - thickness) / 2)}" width="${attr(width * length)}" height="${attr(thickness)}" rx="2" fill="#252525"/>`);
    } else if (node.role === 'image') {
      lines.push(`<rect x="${attr(x)}" y="${attr(y)}" width="${attr(width)}" height="${attr(height)}" fill="#cecec8" stroke="#676761" stroke-width="2"/>`);
      lines.push(`<path d="M${attr(x)} ${attr(y)}L${attr(x + width)} ${attr(y + height)}M${attr(x + width)} ${attr(y)}L${attr(x)} ${attr(y + height)}" stroke="#8d8d86" stroke-width="2"/>`);
    } else {
      const fill = item.depth === 0 ? '#e7e5df' : item.depth % 2 === 0 ? '#faf9f5' : '#deddd7';
      lines.push(`<rect x="${attr(x)}" y="${attr(y)}" width="${attr(width)}" height="${attr(height)}" rx="${node.role === 'interactive' ? '6' : '1'}" fill="${fill}" stroke="#74736d" stroke-width="1"/>`);
    }
  }
  lines.push('</svg>', '');
  return lines.join('\n');
}

function assertSelectionCurrent(selection: ReferenceSelectionV2, assemblySha256: string, projectionSha256: string, captureSha256: string): void {
  if (selection.assemblySha256 !== assemblySha256 || selection.projectionSha256 !== projectionSha256 || selection.captureSha256 !== captureSha256) fail('selection is stale for the current reference artifacts');
}

export function buildReferenceVisualPacket(root: string, rawSelection: ReferenceSelectionV2, slotIds: readonly string[]): ReferenceVisualPacketBundle {
  const selection = parseReferenceSelectionV2(rawSelection);
  if (slotIds.length === 0 || new Set(slotIds).size !== slotIds.length) fail('slotIds must be a non-empty unique list');
  const artifacts = readReferenceBoardArtifacts(root);
  const assemblySha256 = sha256(artifacts.assemblyBytes); const selectionSha256 = referenceSelectionV2Sha256(selection);
  assertSelectionCurrent(selection, assemblySha256, sha256(artifacts.projectionBytes), sha256(artifacts.boardBytes));
  const candidate = artifacts.assembly.candidates.find((entry) => entry.id === selection.candidateId) ?? fail('selected candidate is missing');
  const rawCandidate = artifacts.raw.candidates.find((entry) => entry.id === selection.candidateId) ?? fail('selected raw candidate is missing');
  const entries: PacketEntry[] = []; const evidenceEntries: ReferenceVisualPacketEvidence['entries'][number][] = []; const assets = new Map<string, string>();
  for (const slotId of [...slotIds].sort()) {
    const disposition = selection.slots.find((slot) => slot.slotId === slotId) ?? fail(`slot ${slotId} is not in the selection`);
    if (disposition.obligationDisposition !== 'used' || disposition.rights !== 'lawful') fail(`slot ${slotId} is not a used lawful selection`);
    const piece = candidate.pieces.find((entry) => entry.slotId === slotId) ?? fail(`slot ${slotId} is missing from the assembly`);
    const rawPiece = rawCandidate.pieces.find((entry) => entry.slotId === slotId) ?? fail(`slot ${slotId} is missing from raw evidence`);
    const binding = piece.binding ?? fail(`slot ${slotId} has no influence binding`);
    if (!GEOMETRY_AXES.has(binding.axis)) fail(`slot ${slotId} axis ${binding.axis} cannot be neutralized as geometry`);
    const transfer = requireComponentCaptureTransfer(piece.transfer, slotId);
    const rawEvidence = requireComponentCaptureEvidence(rawPiece.evidence, slotId);
    const svg = geometrySvg(transfer.blueprint.nodes); const artifactSha256 = sha256(svg);
    const artifactPath = `.omd/reference-visual-packets/sha256-${artifactSha256}.svg`;
    assets.set(artifactPath, svg);
    entries.push({
      slotId, axis: binding.axis, zoneId: binding.zoneId, decisionId: binding.decisionId,
      targetSelector: piece.targetSelector, targetViewports: binding.targetViewports.map((viewport) => ({ ...viewport })),
      artifact: { path: artifactPath, sha256: artifactSha256, mimeType: 'image/svg+xml' },
      sanitizer: { schema: GEOMETRY_NEUTRALIZATION_SCHEMA, dropped: DROPPED, preserved: PRESERVED, nodeCount: transfer.blueprint.nodes.length },
    });
    evidenceEntries.push({
      slotId, referenceId: rawPiece.referenceId, sourceCaptureSha256: rawEvidence.imageSha256,
      blueprintSha256: sha256(canonicalJson(transfer.blueprint)), artifactPath, artifactSha256,
    });
  }
  const packet: ReferenceVisualPacket = {
    schema: REFERENCE_VISUAL_PACKET_SCHEMA, assemblySha256, selectionSha256, candidateId: selection.candidateId,
    noShip: true, sourceFree: true, entries,
  };
  const evidence: ReferenceVisualPacketEvidence = {
    schema: REFERENCE_VISUAL_PACKET_EVIDENCE_SCHEMA, packetSha256: sha256(canonicalJson(packet)), assemblySha256,
    selectionSha256, candidateId: selection.candidateId, entries: evidenceEntries,
  };
  return { packet, evidence, assets };
}

export function validateReferenceVisualPacketCurrentness(root: string, selection: ReferenceSelectionV2): ReferenceVisualPacketBundle {
  let packetValue: unknown; let evidenceValue: unknown; let packetBytes: Buffer; let evidenceBytes: Buffer;
  try {
    packetBytes = readContainedRegularFile(root, '.omd/reference-visual-packet.json', 'reference visual packet');
    evidenceBytes = readContainedRegularFile(root, '.omd/reference-visual-packet-evidence.json', 'reference visual packet evidence');
    packetValue = JSON.parse(packetBytes.toString('utf8'));
    evidenceValue = JSON.parse(evidenceBytes.toString('utf8'));
  } catch (error) { return fail(error instanceof Error ? error.message : 'packet records are missing or invalid'); }
  if (typeof packetValue !== 'object' || packetValue === null || !Array.isArray((packetValue as { entries?: unknown }).entries)) fail('packet has an invalid shape');
  const slotIds = (packetValue as { entries: unknown[] }).entries.map((entry) => typeof entry === 'object' && entry !== null ? (entry as { slotId?: unknown }).slotId : undefined);
  if (slotIds.some((slotId) => typeof slotId !== 'string')) fail('packet entries require slotId');
  const expected = buildReferenceVisualPacket(root, selection, slotIds as string[]);
  if (packetBytes.toString('utf8') !== canonicalJson(expected.packet)) fail('packet is stale, non-canonical, or contains unknown fields');
  if (evidenceBytes.toString('utf8') !== canonicalJson(expected.evidence)) fail('packet evidence is stale, non-canonical, or contains unknown fields');
  for (const [path, bytes] of expected.assets) {
    const actual = readContainedRegularFile(root, path, `reference visual packet asset ${path}`);
    if (sha256(actual) !== sha256(bytes) || !actual.equals(Buffer.from(bytes))) fail(`packet asset ${path} is stale`);
  }
  return expected;
}

export function assertReferenceVisualPacketNotShipped(root: string, bundle: ReferenceVisualPacketBundle, productionPaths: readonly string[]): void {
  if (productionPaths.length === 0) fail('productionPaths must name at least one shipped file');
  for (const path of productionPaths) {
    const bytes = readContainedRegularFile(root, path, `production file ${path}`);
    const text = bytes.toString('utf8');
    for (const [assetPath, asset] of bundle.assets) {
      const digest = sha256(asset);
      if (bytes.equals(Buffer.from(asset)) || text.includes(assetPath) || text.includes(digest)) fail(`production file ${path} reuses no-ship packet ${assetPath}`);
    }
  }
}
