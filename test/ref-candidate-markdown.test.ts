import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReferenceCandidates } from '../core/ref/candidate-markdown.ts';
import type { RawReferenceBoard } from '../core/ref/board-artifacts.ts';
import type { ReferenceAssembly } from '../core/ref/board-projection.ts';

const raw: RawReferenceBoard = {
  schemaVersion: 'reference-board-evidence-v1', frameSha256: 'a'.repeat(64), candidates: [{
    id: 'candidate', label: '안전 | <script>', route: '/work', rationale: 'A safe table.', pieces: [{
      slotId: 'component', sourceKind: 'component-capture', referenceId: 'reference', targetComponent: 'hero|<svg>', targetSelector: '[data-card]', taskIds: ['T1'], reason: 'Keep hierarchy.', take: ['structure'], avoid: 'No copy.', adaptation: 'Use a local rhythm.', grid: { column: 1, span: 12, order: 0 },
      evidence: { kind: 'component-capture', source: 'https://capture.example/[bad](javascript:alert(1))<svg>', component: 'card|tile', selector: '[data-card]', capturedAt: '2026-07-19T00:00:00.000Z', imagePath: '.omd/refs/card.png', imageSha256: 'b'.repeat(64) },
    }],
  }],
};
const assembly: ReferenceAssembly = {
  schemaVersion: 'reference-assembly-v1', frameSha256: 'a'.repeat(64), candidates: [{
    id: 'candidate', label: '안전 | <script>', route: '/work', rationale: 'A safe table.', pieces: [{
      slotId: 'component', targetComponent: 'hero|<svg>', targetSelector: '[data-card]', taskIds: ['T1'], reason: 'Keep hierarchy.', take: ['structure'], avoid: 'No copy.', adaptation: 'Use a local rhythm.', grid: { column: 1, span: 12, order: 0 }, transfer: { visualRole: 'hierarchy', principles: ['Use local rhythm.'] },
    }],
  }],
};

test('candidate Markdown is deterministic, Korean-first, and escapes table and HTML injection', () => {
  const first = formatReferenceCandidates(raw, assembly);
  const second = formatReferenceCandidates(raw, assembly);

  assert.equal(second, first); assert.match(first, /출처 사이트\/페이지 \(Source site\/page\)/); assert.match(first, /안전 \\| &lt;script&gt;/); assert.match(first, /card\\|tile/); assert.match(first, /hero\\|&lt;svg&gt;/); assert.match(first, /\\\[bad\\\]\\\(javascript:alert\\\(1\\\)\\\)/); assert.doesNotMatch(first, /<script>|<svg>|\[bad\]\(javascript:/);
});
