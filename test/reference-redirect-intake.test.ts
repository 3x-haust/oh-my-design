import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { captureFinalUrlGuard, captureLane } from '../core/ref/capture-intake.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { capturePageForRef, withBrowser } from '../core/render/index.ts';

test('request language does not refuse a public foreign capture without market judgment', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-korean-intake-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const input = { ...(inputSkeleton('product-route-input').skeleton as Record<string, unknown>),
    request: '한국어로 복지 혜택을 찾고 신청하는 데스크톱 서비스를 구현해줘.' };
  const invocation = publishTestAdaptiveRoute(cwd, input);
  const english = 'Find government benefits and financial help';
  const korean = '나에게 맞는 복지 혜택을 찾고 신청 준비를 시작하세요';
  const guard = captureFinalUrlGuard(cwd, [{ source: 'https://www.usa.gov/benefits', lane: 'domain' }], invocation);
  assert.doesNotThrow(() => guard(0, 'https://www.usa.gov/benefits', english));
  assert.equal(captureLane(cwd, { source: 'https://www.usa.gov/benefits', lane: 'domain', image: true }, invocation), 'domain');
  assert.equal(captureLane(cwd, { source: 'https://www.usa.gov/benefits', lane: 'domain', image: true,
    fromUser: true }, invocation), 'domain');
  const allegedUser = captureFinalUrlGuard(cwd, [{ source: 'https://www.usa.gov/benefits', lane: 'domain',
    fromUser: true }], invocation);
  assert.doesNotThrow(() => allegedUser(0, 'https://www.usa.gov/benefits', english));
  assert.doesNotThrow(() => guard(0, 'https://www.usa.gov/benefits',
    english.repeat(100) + ' 한국어 도움말과 접근성 안내를 확인하세요'));
  const koreanGuard = captureFinalUrlGuard(cwd, [{ source: 'https://wello.info/benefits', lane: 'domain' }], invocation);
  assert.doesNotThrow(() => koreanGuard(0, 'https://wello.info/benefits', korean));
  const englishKr = captureFinalUrlGuard(cwd, [{ source: 'https://unrelated.kr/benefits', lane: 'domain' }], invocation);
  assert.doesNotThrow(() => englishKr(0, 'https://unrelated.kr/benefits', english));
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
  mkdirSync(join(cwd, '.omd/refs/domain'), { recursive: true });
  for (const [index, source] of ['https://welfarehello.com/benefits', 'https://plus.gov.kr/portal/benefitV2',
    'https://wis.seoul.go.kr/'].entries()) {
    const imagePath = `.omd/refs/domain/local-${index}.png`;
    const image = Buffer.from(`observed local image ${index}`);
    writeFileSync(join(cwd, imagePath), image);
    writeFileSync(join(cwd, `.omd/refs/domain/local-${index}.json`), JSON.stringify({
      source, component: `local-${index}`, researchLane: 'domain', kind: 'page',
      capturedAt: new Date().toISOString(), visibleKoreanText: true,
      acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [],
        imageSha256: createHash('sha256').update(image).digest('hex') },
      imagePath, invariants: null, principles: [],
    }));
  }
  assert.doesNotThrow(() => guard(0, 'https://www.usa.gov/benefits', english));
});

test('selector-scoped capture still checks visible language on the full source page', async t => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<main><p>' + 'A'.repeat(12001) + '</p><h1>'
      + '나에게 맞는 복지 혜택을 찾아 신청을 준비하세요'.repeat(400) + '</h1><div id="icon">OK</div></main>');
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  let pageText = '';
  await withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}/`,
    { width: 1280, height: 900 }, { selector: '#icon', validateFinalUrl: (_url, text) => { pageText = text; } }));
  assert.match(pageText, /나에게 맞는 복지 혜택/u);
  assert.ok(pageText.length > 12000);
});
test('a gallery capture must remain the exact requested item regardless of user origin', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-gallery-redirect-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const invocation = publishTestAdaptiveRoute(cwd, inputSkeleton('product-route-input').skeleton);
  const source = 'https://dribbble.com/shots/123-ui';
  const guard = captureFinalUrlGuard(cwd, [{ source, lane: 'design' }], invocation);
  assert.doesNotThrow(() => guard(0, source));
  assert.throws(() => guard(0, 'https://domain.example/service'), /DESIGN_DISCOVERY_REDIRECT/);
  assert.throws(() => guard(0, 'https://dribbble.com/shots/456-other-ui'), /DESIGN_DISCOVERY_REDIRECT/);
  assert.throws(() => guard(0, 'https://www.pinterest.com/pin/987654321/'), /DESIGN_DISCOVERY_REDIRECT/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
  const user = captureFinalUrlGuard(cwd, [{ source, lane: 'design', fromUser: true }], invocation);
  assert.throws(() => user(0, 'https://user-reference.example/view'), /DESIGN_DISCOVERY_REDIRECT/);
  const intoGallery = captureFinalUrlGuard(cwd, [{ source: 'https://user-reference.example/view', lane: 'design', fromUser: true }], invocation);
  assert.throws(() => intoGallery(0, source), /DESIGN_DISCOVERY_REDIRECT/);
});

test('a changed gallery item cannot fabricate traversal for a direct source', t => {
  const value = designAdmissionFixture(t);
  const invocation = publishTestAdaptiveRoute(value.root, inputSkeleton('product-route-input').skeleton);
  assert.ok(value.gallery.ref.acquisition);
  value.gallery.ref.acquisition.finalUrl = 'https://www.pinterest.com/pin/987654321/';
  writeFileSync(value.gallery.path, JSON.stringify(value.gallery.ref));
  assert.equal(captureLane(value.root, { source: value.source.source, lane: 'design' }, invocation), 'design');
});

test('a redirected service may inform both lanes without asserting independent corroboration', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-redirect-intake-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const invocation = publishTestAdaptiveRoute(cwd, inputSkeleton('product-route-input').skeleton);
  const finalUrl = 'https://service.example/workspace';
  const guard = captureFinalUrlGuard(cwd, [
    { source: 'https://directory.example/service', lane: 'domain' },
    { source: 'https://visual.example/service', lane: 'design', fromUser: true },
  ], invocation);
  assert.doesNotThrow(() => guard(0, finalUrl, 'Application requirements and preparation status'));
  assert.doesNotThrow(() => guard(1, finalUrl, 'Application requirements and preparation status'));
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
});
