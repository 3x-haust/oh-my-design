import type { RawReferenceBoard } from './board-artifacts.ts';
import type { ReferenceAssembly, ReferenceAssemblyPiece } from './board-projection.ts';

const cell = (value: string): string => value.replace(/[\r\n]+/g, ' ').replaceAll('&', '&amp;').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('`', '\\`');
const host = (source: string): string => { try { return new URL(source).hostname; } catch { return source; } };
const source = (piece: RawReferenceBoard['candidates'][number]['pieces'][number]): string => piece.evidence.kind === 'component-capture'
  ? `${host(piece.evidence.source)} — ${piece.evidence.source}`
  : `${host(piece.evidence.sourcePage)} — ${piece.evidence.sourcePage}`;
const part = (piece: RawReferenceBoard['candidates'][number]['pieces'][number]): string => piece.evidence.kind === 'component-capture'
  ? `컴포넌트: ${piece.evidence.component} — ${piece.evidence.selector}`
  : `이미지 조각: ${piece.evidence.captureRegion}`;
const localCapture = (piece: RawReferenceBoard['candidates'][number]['pieces'][number]): string => piece.evidence.imagePath.trim() === '' ? '—' : piece.evidence.imagePath;
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
      return `| ${cell(source(rawPieceValue))} | ${cell(part(rawPieceValue))} | ${cell(localCapture(rawPieceValue))} | ${cell(`${candidate.route} → ${piece.targetComponent}`)} | ${cell(piece.take.join(', '))} | ${cell(piece.avoid)} | ${cell(piece.adaptation)} |`;
    });
    return [`## 후보 (Candidate): ${cell(candidate.label)}`, `경로 (Route): ${cell(candidate.route)}`, `근거 (Rationale): ${cell(candidate.rationale)}`, '', '| 출처 사이트/페이지 (Source site/page) | 정확한 UI/이미지 부분 (Exact UI/image part) | 로컬 캡쳐 (Local capture) | 제안 대상 경로/컴포넌트 (Proposed target route/component) | 가져올 점 (Take) | 피할 점 (Avoid) | 적용 방식 (Adaptation) |', '| --- | --- | --- | --- | --- | --- | --- |', ...rows].join('\n');
  });
  return ['# 참조 후보 (Reference candidates)', ...sections].join('\n\n').concat('\n');
}
