import type { RawReferenceBoard } from './board-artifacts.ts';
import type { ReferenceAssembly, ReferenceAssemblyPiece } from './board-projection.ts';

const cell = (value: string): string => value.replace(/[\r\n]+/g, ' ').replaceAll('&', '&amp;').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('`', '\\`');
const host = (source: string): string => { try { return new URL(source).hostname; } catch { return source; } };
const source = (piece: RawReferenceBoard['candidates'][number]['pieces'][number]): string => piece.evidence.kind === 'image-fragment'
  ? `${host(piece.evidence.sourcePage)} — ${piece.evidence.sourcePage}`
  : `${host(piece.evidence.source)} — ${piece.evidence.source}`;
const part = (piece: RawReferenceBoard['candidates'][number]['pieces'][number]): string => {
  switch (piece.evidence.kind) {
    case 'component-capture': return `컴포넌트: ${piece.evidence.component} — ${piece.evidence.selector}`;
    case 'image-fragment': return `이미지 조각: ${piece.evidence.captureRegion}`;
    case 'classified-reference': return `비시각 근거: ${piece.evidence.component} — ${piece.evidence.classification}`;
  }
};
const localCapture = (piece: RawReferenceBoard['candidates'][number]['pieces'][number]): string => piece.evidence.kind === 'classified-reference' || piece.evidence.imagePath.trim() === '' ? '—' : piece.evidence.imagePath;
const rawPiece = (candidate: RawReferenceBoard['candidates'][number], piece: ReferenceAssemblyPiece): RawReferenceBoard['candidates'][number]['pieces'][number] => {
  const found = candidate.pieces.find((item) => item.slotId === piece.slotId);
  if (found === undefined) throw new Error(`candidate ${candidate.id} is missing raw evidence for ${piece.slotId}`);
  return found;
};

export function formatReferenceCandidates(raw: RawReferenceBoard, assembly: ReferenceAssembly): string {
  const candidates = new Map(raw.candidates.map((candidate) => [candidate.id, candidate]));
  const sections = assembly.candidates.map((candidate) => {
    const evidence = candidates.get(candidate.id);
    if (evidence === undefined) throw new Error(`assembly candidate ${candidate.id} has no raw evidence`);
    const rows = candidate.pieces.map((piece) => {
      const rawPieceValue = rawPiece(evidence, piece);
      const destination = piece.binding === undefined
        ? `${candidate.route} → ${piece.targetComponent}`
        : `${candidate.route} → ${piece.targetComponent} · ${piece.binding.zoneId}/${piece.binding.decisionId}/${piece.binding.axis}`;
      return `| ${cell(source(rawPieceValue))} | ${cell(part(rawPieceValue))} | ${cell(localCapture(rawPieceValue))} | ${cell(destination)} | ${cell(piece.take.join(', '))} | ${cell(piece.avoid)} | ${cell(piece.adaptation)} |`;
    });
    return [`## 후보 (Candidate): ${cell(candidate.label)}`, `경로 (Route): ${cell(candidate.route)}`, `근거 (Rationale): ${cell(candidate.rationale)}`, '', '| 출처 사이트/페이지 (Source site/page) | 정확한 UI/이미지 부분 (Exact UI/image part) | 로컬 캡쳐 (Local capture) | 제안 대상 경로/컴포넌트 (Proposed target route/component) | 가져올 점 (Take) | 피할 점 (Avoid) | 적용 방식 (Adaptation) |', '| --- | --- | --- | --- | --- | --- | --- |', ...rows].join('\n');
  });
  return ['# 참조 후보 (Reference candidates)', ...sections].join('\n\n').concat('\n');
}
