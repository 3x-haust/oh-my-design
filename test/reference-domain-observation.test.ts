import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { readDomainObservation } from '../core/ref/domain-observation.ts';
import { classifyKoreanServiceText } from '../core/ref/market-reference.ts';
import { withBrowser } from '../core/render/index.ts';
import { discoveryBrowser, discoveryFixture, PUBLIC_DIRECTORY, DOMAIN_ITEM } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

test('Korean text on .com is Korean; empty text is undetermined, not foreign', () => {
  assert.equal(classifyKoreanServiceText('복지 서비스 혜택 신청 대상 안내입니다'), 'korean');
  assert.equal(classifyKoreanServiceText(''), 'undetermined');
  assert.equal(classifyKoreanServiceText('English-only service homepage'), 'non-korean');
});

test('domain navigation signs visible text and links without publishing a screenshot', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: PUBLIC_DIRECTORY,
      html: `<meta charset="utf-8"><main><h1>복지 서비스 혜택 신청 대상 안내입니다</h1><a href="${DOMAIN_ITEM}">신청 정보 확인하기</a><span hidden>Fabricated hidden feature</span></main>` });
    const receipt = await captureReferenceNavigation(observed.browser, PUBLIC_DIRECTORY, 'domain', createTestProjectWriteAdapter(root));
    const record = readDomainObservation(root, receipt);
    assert.equal(record.language, 'korean', record.observedText ?? '');
    assert.match(record.observedText ?? '', /복지 서비스/);
    assert.doesNotMatch(record.observedText ?? '', /Fabricated hidden feature/);
    assert.deepEqual(record.linkLabels, [{ url: DOMAIN_ITEM, text: '신청 정보 확인하기' }]);
    assert.equal(existsSync(join(root, '.omd/discovery/domain/navigation')), false);
    assert.equal(existsSync(join(root, '.omd/refs/domain')), false);
    const bytes = readFileSync(join(root, receipt.capture.path));
    assert.ok(bytes.length > 0);
    assert.equal(observed.captures.length, 0);
    assert.throws(() => readDomainObservation(root, { url: DOMAIN_ITEM, capture: receipt.capture }), /REFERENCE_DOMAIN_OBSERVATION_REQUIRED/);
  });
});
