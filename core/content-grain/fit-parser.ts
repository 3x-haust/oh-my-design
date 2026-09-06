import type { ContentFitCheck, ContentFitReceipt } from './contract.ts';
import {
  closedObject,
  digest,
  freeze,
  identifier,
  invalid,
  list,
  literal,
  unique,
} from './strict.ts';

export const parseContentFitReceipt = (value: unknown): ContentFitReceipt => {
  const receipt = closedObject(value, 'content fit receipt', [
    'schema',
    'status',
    'grain',
    'decisionGraphSha256',
    'checks',
  ]);
  if (receipt.schema !== 'content-fit-receipt-v1') {
    invalid('fit schema must be content-fit-receipt-v1');
  }
  const grain = closedObject(receipt.grain, 'content fit receipt grain', [
    'path',
    'schema',
    'sha256',
  ]);
  if (grain.path !== '.omd/content-grain.json' || grain.schema !== 'content-grain-v1') {
    invalid('fit grain pointer must reference .omd/content-grain.json content-grain-v1');
  }
  const checks = list(receipt.checks, 'content fit checks').map((entry, index) => {
    const check = closedObject(entry, `checks[${index}]`, [
      'traitId',
      'fixtureId',
      'viewport',
      'observationSha256',
    ]);
    return {
      traitId: identifier(check.traitId, `checks[${index}].traitId`),
      fixtureId: identifier(check.fixtureId, `checks[${index}].fixtureId`),
      viewport: literal(check.viewport, `checks[${index}].viewport`, ['desktop', 'mobile']),
      observationSha256: digest(
        check.observationSha256,
        `checks[${index}].observationSha256`,
      ),
    } satisfies ContentFitCheck;
  });
  unique(
    checks.map(({ traitId, fixtureId, viewport }) => `${traitId}:${fixtureId}:${viewport}`),
    'content fit checks',
  );
  return freeze({
    schema: 'content-fit-receipt-v1',
    status: literal(receipt.status, 'content fit status', ['fit', 'no-stable-grain']),
    grain: {
      path: '.omd/content-grain.json',
      schema: 'content-grain-v1',
      sha256: digest(grain.sha256, 'content fit grain sha256'),
    },
    decisionGraphSha256: digest(
      receipt.decisionGraphSha256,
      'content fit decision graph sha256',
    ),
    checks,
  });
};
