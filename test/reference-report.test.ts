import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReferenceReport, type ReferenceReportSnapshot } from '../core/ref/reference-report.ts';

test('reference report is Korean-first Markdown ready for final chat', () => {
  // Given: a validated usage snapshot supplied by the reference pipeline.
  const snapshot: ReferenceReportSnapshot = { attributionSha256: 'a'.repeat(64), compositeLineageState: 'generated', rows: [{ status: 'used', sourcePage: 'https://ui.example/catalog', sourceRegion: 'product card — [data-card]', target: '/shop · ShopHero · [data-omd="shop-hero"]', borrowedProperties: ['vertical hierarchy'], nonBorrowedProperties: ['source copy'], transformation: 'Rebuilt with local tokens.', evidence: 'src/shop.ts · [data-omd="shop-hero"] · Rendered independently.' }, { status: 'rejected', sourcePage: 'https://pinterest.example/pin/tiles', sourceRegion: 'mosaic | upper <image>\nfragment', target: '/shop · ShopHero · [data-omd="shop-hero"]', borrowedProperties: [], nonBorrowedProperties: ['source pixels'], transformation: 'Generated a local gradient.', evidence: 'src/shop.ts · [data-omd="shop-hero"] · No source image ships.' }, { status: 'anti-reference', sourcePage: 'https://ui.example/catalog', sourceRegion: 'footer links — [data-footer]', target: '/shop · ShopFooter · [data-omd="shop-footer"]', borrowedProperties: [], nonBorrowedProperties: ['dense grouping'], transformation: 'Expanded local spacing.', evidence: 'src/shop.ts · [data-omd="shop-footer"] · Deliberately distinct.' }] };

  // When: the pure formatter renders the report.
  const markdown = formatReferenceReport(snapshot);

  // Then: it begins with the Korean provenance table before English.
  assert.match(markdown, /^## 참조 사용 보고서/m); assert.ok(markdown.indexOf('## 참조 사용 보고서') < markdown.indexOf('## Reference usage report')); assert.match(markdown, /사용됨 \(used\)/); assert.match(markdown, /rejected/); assert.match(markdown, /anti-reference/); assert.match(markdown, /mosaic ¦ upper ＜image＞ fragment/);
});

test('reference report neutralizes active Markdown and directional control carriers', () => {
  // Given: validated upstream provenance and row fields containing active Markdown, HTML, controls, and Korean text.
  const unsafe = '[x](https://source.example) ![image] `code` <https://source.example> | tab\tline\n\u0000\u0085\u061c\u200e\u200f\u202e한국어 English';
  const snapshot: ReferenceReportSnapshot = { attributionSha256: 'b'.repeat(64), compositeLineageState: 'generated', rows: [{ status: 'used', sourcePage: unsafe, sourceRegion: unsafe, target: unsafe, borrowedProperties: [unsafe], nonBorrowedProperties: [unsafe], transformation: unsafe, evidence: unsafe }] };

  // When: report cells are rendered for direct final-chat use.
  const markdown = formatReferenceReport(snapshot);

  // Then: no active carrier or invisible directional/control byte remains while readable text survives.
  assert.doesNotMatch(markdown, /\[x\]\(https:|!\[image\]|`code`|<https:|\| tab|\t|\n\u0000|\u0085|\u061c|\u200e|\u200f|\u202e/); assert.match(markdown, /한국어 English/);
});
