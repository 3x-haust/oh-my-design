import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRoleDelivery } from './helpers/prompt-delivery.ts';
import { parseDynamicTypeCoverage } from '../core/brief/dynamic-type.ts';
import { parseAccessibilityPlan } from '../core/frame/process-plan.ts';

for (const role of ['framer', 'scout', 'writer', 'typesetter', 'composer', 'hand', 'eye']) test(`locale role ships the current source profile: ${role}`, () => assertRoleDelivery(role));

test('locale type policy preserves distinct locale identities and range-based dynamic input', () => {
  const value = { locales: ['zh-CN', 'zh-TW'], scripts: ['Han'], sources: [{ roleId: 'body', kind: 'cms', bounded: false }], unicodeRanges: ['U+4E00-9FFF'], requiredPunctuationAndSymbols: [], normalization: 'preserve', fallbackStack: ['sans-serif'], unknownScriptPolicy: 'fallback', subsets: [] };
  assert.deepEqual(parseDynamicTypeCoverage(value).locales, ['zh-CN', 'zh-TW']);
  assert.throws(() => parseDynamicTypeCoverage({ ...value, unicodeRanges: [] }));
});

test('unknown writing-mode applicability retains an evidence obligation instead of passing', () => {
  const item = { id: 'direction', concern: 'direction-writing-mode', applicability: 'unknown', surfaceIds: ['main'], taskIds: [], stateIds: ['entry'], viewIds: ['mobile'], rationale: 'Supported writing directions require assessment.', requiredEvidence: ['actual rendered mixed-direction strings'], method: 'browser observation' };
  assert.equal(parseAccessibilityPlan({ schema: 'accessibility-plan-v1', items: [item] }).items[0]!.applicability, 'unknown');
  assert.throws(() => parseAccessibilityPlan({ schema: 'accessibility-plan-v1', items: [{ ...item, requiredEvidence: [] }] }));
});
