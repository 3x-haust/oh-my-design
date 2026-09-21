import assert from 'node:assert/strict';
import test from 'node:test';
import { negatesMarketScope } from '../core/ref/market-scope-negation.ts';

const tokens = ['대한민국', 'South Korea'];

test('market exclusion recognizes direct English and Korean denial phrases', () => {
  for (const value of [
    'This service does not serve users in South Korea',
    'South Korea residents are not served by this service',
    'Unavailable to residents of South Korea',
    'South Korea users are not eligible for this service',
    'South Korea service is not offered to customers',
    'South Korea is outside our coverage',
    'This platform does not operate in South Korea',
    'This service is no longer available in South Korea',
    'No services are offered in South Korea',
    'South Korea was excluded from this service',
    '대한민국에서는 이 서비스를 이용할 수 없습니다',
    '대한민국 거주자는 지원 대상이 아닙니다',
    '대한민국 서비스 대상에서 제외됩니다',
    '대한민국 서비스는 제공하지 않습니다',
  ]) assert.equal(negatesMarketScope(value, tokens), true, value);
});

test('market exclusion preserves unrelated warnings and explicit positive scope', () => {
  for (const value of [
    'South Korea benefits service with unsupported browser notices',
    'Not only South Korea residents use this benefits service',
    'No service is available outside South Korea',
    'This service is not unavailable in South Korea',
    'South Korea is excluded from the unsupported list',
    'Services outside South Korea are excluded from this directory',
  ]) assert.equal(negatesMarketScope(value, tokens), false, value);
});
