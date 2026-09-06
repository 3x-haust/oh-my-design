import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentGrainDecisionToken,
  contentGrainSha256,
  parseContentFitReceipt,
  parseContentGrain,
  validateContentFitCoverage,
} from '../core/content-grain/contract.ts';

const grainFixture = () =>
  parseContentGrain({
    schema: 'content-grain-v1',
    status: 'active',
    sources: [
      {
        id: 'catalog',
        authority: 'project-first-party',
        path: 'content/catalog.json',
        sha256: 'a'.repeat(64),
      },
    ],
    fixtures: [
      {
        id: 'typical-description',
        sourceId: 'catalog',
        locator: '$.services[1].description',
        role: 'typical',
      },
      {
        id: 'long-description',
        sourceId: 'catalog',
        locator: '$.services[2].description',
        role: 'maximum',
      },
    ],
    traits: [
      {
        id: 'description-length',
        sourceIds: ['catalog'],
        fixtureIds: ['typical-description', 'long-description'],
        metric: {
          kind: 'range',
          unit: 'graphemes',
          minimum: 12,
          typical: 48,
          maximum: 164,
        },
        semanticRole: 'primary-proof',
        antiTemplateConsequence: 'Do not force every service into equal-height cards.',
        responsiveConsequence: 'Keep the long proof adjacent to its service action.',
        falsifier: 'The long description clips or loses semantic priority.',
      },
    ],
  });

test('requires every fixture at desktop and mobile', () => {
  const grain = grainFixture();
  const grainSha = contentGrainSha256(grain);
  const token = contentGrainDecisionToken(grainSha, 'description-length');
  const receipt = parseContentFitReceipt({
    schema: 'content-fit-receipt-v1',
    status: 'fit',
    grain: {
      path: '.omd/content-grain.json',
      schema: 'content-grain-v1',
      sha256: grainSha,
    },
    decisionGraphSha256: 'b'.repeat(64),
    checks: ([
      ['typical-description', 'desktop', 'c'],
      ['typical-description', 'mobile', 'd'],
      ['long-description', 'desktop', 'e'],
    ] as const).map(([fixtureId, viewport, hash]) => ({
      traitId: 'description-length',
      fixtureId,
      viewport,
      observationSha256: hash.repeat(64),
    })),
  });

  assert.throws(
    () =>
      validateContentFitCoverage({
        grain,
        grainSha256: grainSha,
        decisionGraphSha256: 'b'.repeat(64),
        receipt,
        observations: receipt.checks.map((check) => ({
          sha256: check.observationSha256,
          decisionRefs: [token],
        })),
      }),
    /INCOMPLETE_CONTENT_FIT_COVERAGE.*long-description.*mobile/i,
  );
});

test('rejects unbound grain decisions', () => {
  const grain = grainFixture();
  const grainSha = contentGrainSha256(grain);
  const checks = ([
    ['typical-description', 'desktop', 'c'],
    ['typical-description', 'mobile', 'd'],
    ['long-description', 'desktop', 'e'],
    ['long-description', 'mobile', 'f'],
  ] as const).map(([fixtureId, viewport, hash]) => ({
    traitId: 'description-length',
    fixtureId,
    viewport,
    observationSha256: hash.repeat(64),
  }));
  const receipt = parseContentFitReceipt({
    schema: 'content-fit-receipt-v1',
    status: 'fit',
    grain: {
      path: '.omd/content-grain.json',
      schema: 'content-grain-v1',
      sha256: grainSha,
    },
    decisionGraphSha256: 'b'.repeat(64),
    checks,
  });

  assert.throws(
    () =>
      validateContentFitCoverage({
        grain,
        grainSha256: grainSha,
        decisionGraphSha256: 'b'.repeat(64),
        receipt,
        observations: checks.map((check) => ({
          sha256: check.observationSha256,
          decisionRefs: ['unrelated-decision'],
        })),
      }),
    /UNBOUND_CONTENT_GRAIN_DECISION.*description-length/i,
  );
});
