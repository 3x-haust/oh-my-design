import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  designerJudgmentProjection, designerJudgments, designerJudgmentsMarkdown, parseDesignerJudgments,
  selectDesignerJudgments,
} from '../core/design/designer-judgments.ts';

test('shipped designer judgments parse and are written without source material', () => {
  const judgments = designerJudgments();
  assert.ok(judgments.length >= 20, String(judgments.length));
  const raw = readFileSync(new URL('../core/design/designer-judgments.json', import.meta.url), 'utf8');
  // Distilled in OMD's own words: no links, video ids, timestamps or quotation marks around borrowed speech.
  assert.doesNotMatch(raw, /https?:|youtu|watch\?v=|\d{1,2}:\d{2}:\d{2}|[“”]/);
  for (const judgment of judgments) {
    for (const field of [judgment.look, judgment.ask, judgment.move, judgment.why, judgment.notWhen]) {
      assert.doesNotMatch(field, /\b\d+\s?(px|rem|pt)\b/, `${judgment.id} prescribes a fixed value`);
    }
  }
});

test('the reviewer receives every judgment while the maker can narrow reading by surface', () => {
  const all = designerJudgments();
  const projection = designerJudgmentProjection();
  assert.deepEqual(projection.judgments.map(row => row.id), all.map(row => row.id));
  assert.equal(designerJudgmentProjection().sha256, projection.sha256);
  const marketing = selectDesignerJudgments('marketing');
  const product = selectDesignerJudgments('product');
  assert.ok(marketing.every(row => row.surfaces.includes('any') || row.surfaces.includes('marketing')));
  assert.ok(product.every(row => row.surfaces.includes('any') || row.surfaces.includes('product')));
  assert.ok(marketing.length < all.length && product.length < all.length);
  assert.equal(selectDesignerJudgments('unspecified').length, all.length);
  assert.match(designerJudgmentsMarkdown('product'), /^# Designer judgments \(product\)/);
});

test('a malformed catalog is refused rather than partially loaded', () => {
  const row = { id: 'one-protagonist', surfaces: ['any'], look: 'l', ask: 'a', move: 'm', why: 'w', notWhen: 'n' };
  const catalog = (judgments: unknown[]) => ({ schema: 'designer-judgments-v1', judgments });
  assert.equal(parseDesignerJudgments(catalog([row])).length, 1);
  assert.throws(() => parseDesignerJudgments(catalog([row, row])), /duplicate id/);
  assert.throws(() => parseDesignerJudgments(catalog([{ ...row, surfaces: ['banner'] }])), /surfaces/);
  assert.throws(() => parseDesignerJudgments(catalog([{ ...row, source: 'x' }])), /fields/);
  assert.throws(() => parseDesignerJudgments(catalog([{ ...row, ask: ' ' }])), /ask/);
  assert.throws(() => parseDesignerJudgments({ schema: 'other', judgments: [] }), /catalog/);
});
