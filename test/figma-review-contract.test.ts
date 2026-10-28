import assert from 'node:assert/strict';
import test from 'node:test';
import type { FigmaCompareRegion } from '../core/figma/compare.ts';
import {
  FIGMA_FIDELITY_REVIEW_HANDBACK,
  parseFigmaFidelityReview,
} from '../core/figma/review-contract.ts';

const bindings = {
  buildSha256: 'a'.repeat(64),
  briefSha256: 'b'.repeat(64),
  evidenceSha256: 'c'.repeat(64),
  browserSha256: 'd'.repeat(64),
  diffSha256: 'e'.repeat(64),
  compareSha256: 'f'.repeat(64),
};
const regions: readonly FigmaCompareRegion[] = [{
  index: 0,
  cell: { row: 0, col: 0, x: 0, y: 0, width: 20, height: 20, mismatch: 1 },
  crop: { x: 0, y: 0, width: 24, height: 24 },
  composite: { path: '.omd/figma/compare/1_2/region-0.png', sha256: '1'.repeat(64), width: 72, height: 24 },
  figmaNodes: [{
    id: '2:3',
    name: 'Card',
    type: 'FRAME',
    box: { x: 0, y: 0, width: 20, height: 20 },
    fillColors: ['#ffffff'],
    stroke: { colors: [], weight: null },
    cornerRadius: 8,
    typography: null,
    text: '',
  }],
  renderedElements: [{
    tag: 'article',
    selector: '#card',
    text: 'Card',
    box: { x: 0, y: 0, width: 20, height: 20 },
    styles: {
      fontFamily: 'Arial',
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: 'normal',
      letterSpacing: 'normal',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgb(0, 0, 0)',
      border: '0px none rgb(0, 0, 0)',
      borderRadius: '0px',
      padding: '0px',
      gap: 'normal',
    },
  }],
}];
const fix = {
  id: 'card-background',
  regionIndex: 0,
  element: { figmaNodeId: '2:3', figmaNodeName: 'Card', renderedSelector: '#card' },
  property: 'background-color',
  figmaValue: '#ffffff',
  renderValue: 'rgb(0, 0, 0)',
  instruction: 'Set the card background to #ffffff.',
};
const handback = (fields: object) => ({
  schema: FIGMA_FIDELITY_REVIEW_HANDBACK,
  fixedBindings: bindings,
  verdict: 'match',
  fixes: [],
  priorFixes: [],
  ...fields,
});

test('Figma reviewer handback enforces verdict/fix consistency', () => {
  assert.throws(() => parseFigmaFidelityReview(
    handback({ fixes: [fix] }),
    bindings,
    regions,
    [],
  ), /contradicts/);
  assert.throws(() => parseFigmaFidelityReview(
    handback({ verdict: 'mismatch' }),
    bindings,
    regions,
    [],
  ), /contradicts/);
});

test('Figma reviewer refuses invented selectors and nodes', () => {
  assert.throws(() => parseFigmaFidelityReview(
    handback({ verdict: 'mismatch', fixes: [{ ...fix, element: { ...fix.element, renderedSelector: '#invented' } }] }),
    bindings,
    regions,
    [],
  ), /unknown rendered element/);
  assert.throws(() => parseFigmaFidelityReview(
    handback({ verdict: 'mismatch', fixes: [{ ...fix, element: { ...fix.element, figmaNodeId: '9:9' } }] }),
    bindings,
    regions,
    [],
  ), /unknown Figma element/);
});

test('Figma reviewer reconciles every prior fix exactly once', () => {
  assert.throws(() => parseFigmaFidelityReview(
    handback({ verdict: 'mismatch', fixes: [fix] }),
    bindings,
    regions,
    [fix],
  ), /not reconciled/);
  assert.equal(parseFigmaFidelityReview(
    handback({ verdict: 'mismatch', fixes: [fix], priorFixes: [{ id: fix.id, status: 'unresolved' }] }),
    bindings,
    regions,
    [fix],
  ).verdict, 'mismatch');
  assert.equal(parseFigmaFidelityReview(
    handback({ priorFixes: [{ id: fix.id, status: 'resolved' }] }),
    bindings,
    regions,
    [fix],
  ).verdict, 'match');
});

test('Figma reviewer refuses extra fields in every closed handback', () => {
  assert.throws(() => parseFigmaFidelityReview(
    { ...handback({}), explanation: 'not allowed' },
    bindings,
    regions,
    [],
  ), /unexpected or missing fields/);
  assert.throws(() => parseFigmaFidelityReview(
    handback({ verdict: 'mismatch', fixes: [{ ...fix, confidence: 1 }] }),
    bindings,
    regions,
    [],
  ), /unexpected or missing fields/);
});
