import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseReferenceResearch, validateReferenceResearch } from '../core/ref/reference-research.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { marketContext, marketOptions } from './helpers/market-reference.ts';

test('every explicit market requires current local coverage regardless of fit mode or audience', t => {
  const fixture = designAdmissionFixture(t);
  for (const overrides of [{ desiredFit: 'locale-mechanics-only', audience: null },
    { desiredFit: 'market-grounded', audience: null }]) {
    writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify({ ...marketContext, ...overrides }));
    const warnings: string[] = [];
    validateReferenceResearch(fixture.root, parseReferenceResearch(fixture.research), {
      ...marketOptions, onAdvisory: code => warnings.push(code),
    });
    assert.ok(warnings.includes('REFERENCE_RESEARCH_MARKET_COVERAGE_REQUIRED'));
  }
});

test('request script alone does not assert a target market', t => {
  const fixture = designAdmissionFixture(t);
  const warnings: string[] = [];
  validateReferenceResearch(fixture.root, parseReferenceResearch(fixture.research), {
    ...marketOptions, expectedRequest: '복지 혜택을 찾고 신청을 도와주는 한국어 서비스를 만든다.',
    onAdvisory: code => warnings.push(code),
  });
  assert.ok(!warnings.includes('REFERENCE_RESEARCH_MARKET_COVERAGE_REQUIRED'));
});
