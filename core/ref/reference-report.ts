import { validateReferenceUsage, type ReferenceUsageStatus, type ValidatedReferenceUsage, type ValidatedReferenceUsagePiece } from './reference-usage.ts';
import { referenceReportPath, writeReferenceReport } from './reference-usage-snapshot.ts';

export type ReferenceReportRow = {
  readonly status: ReferenceUsageStatus;
  readonly sourcePage: string;
  readonly sourceRegion: string;
  readonly target: string;
  readonly borrowedProperties: readonly string[];
  readonly nonBorrowedProperties: readonly string[];
  readonly transformation: string;
  readonly evidence: string;
};
export type ReferenceReportSnapshot = { readonly attributionSha256: string; readonly compositeLineageState: 'generated' | 'unavailable'; readonly rows: readonly ReferenceReportRow[] };

const inertCell = (value: string): string => value.normalize('NFC')
  .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
  .replace(/([a-z][a-z0-9+.-]*):\/\//gi, '$1∶／／')
  .replace(/[\\\[\]()`*_~#!<>|&]/g, (character) => ({ '\\': '＼', '[': '［', ']': '］', '(': '（', ')': '）', '`': '｀', '*': '＊', '_': '＿', '~': '～', '#': '＃', '!': '！', '<': '＜', '>': '＞', '|': '¦', '&': '＆' })[character] ?? character)
  .replace(/\s+/g, ' ')
  .trim();
const joined = (values: readonly string[]): string => values.length === 0 ? '—' : values.map(inertCell).join('; ');
const statusKorean = (value: ReferenceUsageStatus): string => {
  switch (value) {
    case 'used': return '사용됨 (used)';
    case 'rejected': return '거절됨 (rejected)';
    case 'anti-reference': return '반(反)참조 (anti-reference)';
  }
};
const source = (piece: ValidatedReferenceUsagePiece): { readonly page: string; readonly region: string } => {
  switch (piece.raw.evidence.kind) {
    case 'component-capture': return { page: piece.raw.evidence.source, region: `${piece.raw.evidence.component} — ${piece.raw.evidence.selector}` };
    case 'image-fragment': {
      const crop = piece.raw.evidence.cropBox;
      const cropSuffix = crop === undefined ? '' : ` (${crop.x}, ${crop.y}, ${crop.width}×${crop.height})`;
      return { page: piece.raw.evidence.sourcePage, region: `${piece.raw.evidence.captureRegion}${cropSuffix}` };
    }
  }
};
const target = (piece: ValidatedReferenceUsagePiece): string => `${piece.usage.target.route} · ${piece.usage.target.component} · ${piece.usage.target.selector}`;
const evidence = (piece: ValidatedReferenceUsagePiece): string => `${piece.usage.evidence.path} · ${piece.usage.evidence.selector} · ${piece.usage.verificationNote}`;
const row = (piece: ReferenceReportRow, korean: boolean): string => {
  const status = korean ? statusKorean(piece.status) : piece.status;
  return `| ${status} | ${inertCell(piece.sourcePage)} | ${inertCell(piece.sourceRegion)} | ${inertCell(piece.target)} | ${joined(piece.borrowedProperties)} | ${joined(piece.nonBorrowedProperties)} | ${inertCell(piece.transformation)} | ${inertCell(piece.evidence)} |`;
};
const table = (snapshot: ReferenceReportSnapshot, korean: boolean): string => {
  const header = korean
    ? '| 상태 | 출처 사이트 / 페이지 | 원본 UI / 이미지 영역 | 배포 대상 | 차용한 속성 | 명시적으로 차용하지 않은 속성 | 변환 | 증거 경로 / 셀렉터 / 검증 |'
    : '| Status | Source site / page | Exact source UI / image region | Shipped target | Borrowed properties | Explicitly not borrowed | Transformation | Evidence path / selector / verification |';
  return `${header}\n|---|---|---|---|---|---|---|---|\n${snapshot.rows.map((piece) => row(piece, korean)).join('\n')}`;
};
const lineageState = (snapshot: ValidatedReferenceUsage): 'generated' | 'unavailable' => {
  switch (snapshot.compositeLineage.state) {
    case 'generated': return 'generated';
    case 'unavailable': return 'unavailable';
  }
};

export function referenceReportSnapshot(value: ValidatedReferenceUsage): ReferenceReportSnapshot {
  return { attributionSha256: value.usage.attributionSha256, compositeLineageState: lineageState(value), rows: value.pieces.map((piece) => {
    const origin = source(piece);
    return { status: piece.usage.status, sourcePage: origin.page, sourceRegion: origin.region, target: target(piece), borrowedProperties: piece.usage.borrowedProperties, nonBorrowedProperties: piece.usage.nonBorrowedProperties, transformation: [piece.usage.transformation, `Selected-assembly rationale: ${piece.assembly.reason}`, `Adaptation: ${piece.assembly.adaptation}`].join(' '), evidence: evidence(piece) };
  }) };
}

export function formatReferenceReport(snapshot: ReferenceReportSnapshot): string {
  return `## 참조 사용 보고서\n\n- 귀속 기록 결속: \`${snapshot.attributionSha256}\`\n- 클린룸 복합 계보: \`${snapshot.compositeLineageState}\`\n\n${table(snapshot, true)}\n\n## Reference usage report\n\n- Attribution record binding: \`${snapshot.attributionSha256}\`\n- Clean-room composite lineage: \`${snapshot.compositeLineageState}\`\n\n${table(snapshot, false)}\n`;
}

export function generateReferenceReport(root: string): string {
  const markdown = formatReferenceReport(referenceReportSnapshot(validateReferenceUsage(root)));
  writeReferenceReport(root, markdown);
  return markdown;
}

export { referenceReportPath };
