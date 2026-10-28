import assert from 'node:assert/strict';
import test from 'node:test';
import { gotoFromSearchResults } from '../core/ref/browse/provenance.ts';
import type { BrowseEvent, BrowseObservation } from '../core/ref/browse/contract.ts';

const observation = (text: string, links: { url: string; text: string }[]) => ({ text, linkClaims: links }) as unknown as BrowseObservation;
const event = (verb: string, sha256: string | null) => ({ action: { verb }, observation: sha256 === null ? null : { sha256 } }) as unknown as BrowseEvent;

test('a gallery work opened from memory is not found because another page names the gallery', () => {
  const search = { seq: 1, action: { verb: 'search', provider: 'onepagelove', query: 'developer' }, url: 'https://onepagelove.com/?s=developer',
    finalUrl: 'https://onepagelove.com/?s=developer', observation: { sha256: 's' } } as unknown as BrowseEvent;
  const observations = new Map([['s', { title: 'One Page Love', text: 'Follow us on Dribbble and Twitter', linkClaims: [] } as unknown as BrowseObservation]]);
  const shot = 'https://dribbble.com/shots/17558437-Developer-tools-landing-page-home-page';
  assert.equal(gotoFromSearchResults(shot, [search], observations), false);
  // Browsing Dribbble itself, or a result linking to that very shot, does find it.
  const dribbble = { seq: 2, action: { verb: 'search', provider: 'dribbble', query: 'developer tools' }, url: 'https://dribbble.com/search/developer-tools',
    finalUrl: 'https://dribbble.com/search/developer-tools', observation: { sha256: 'd' } } as unknown as BrowseEvent;
  observations.set('d', { title: 'Dribbble', text: '', linkClaims: [] } as unknown as BrowseObservation);
  assert.equal(gotoFromSearchResults(shot, [search, dribbble], observations), true);
  // Its full-size original on the gallery's image CDN belongs to the same browsing.
  assert.equal(gotoFromSearchResults('https://cdn.dribbble.com/userupload/47263935/file/863625cf.jpg?resize=752x', [search, dribbble], observations), true);
  assert.equal(gotoFromSearchResults('https://cdn.dribbble.com/userupload/47263935/file/863625cf.jpg?resize=752x', [search], observations), false);
  observations.set('s', { title: 'One Page Love', text: '', linkClaims: [{ url: `${shot}/`, text: 'shot' }] } as unknown as BrowseObservation);
  assert.equal(gotoFromSearchResults(shot, [search], observations), true);
});

test('a gallery work page titled with the first part of a site name discovers that site; body words do not', () => {
  const search = { seq: 1, action: { verb: 'search', provider: 'nook', query: 'design' }, url: 'https://nook.ai.kr/search', observation: { sha256: 's' } } as unknown as BrowseEvent;
  const click = { seq: 2, action: { verb: 'click' }, observation: { sha256: 'd' } } as unknown as BrowseEvent;
  const observations = new Map([
    ['s', { title: 'nook 검색', text: '디자인 사이트', linkClaims: [] } as unknown as BrowseObservation],
    ['d', { title: 'Flint – nook', text: '사이트 방문 design studio', linkClaims: [] } as unknown as BrowseObservation],
  ]);
  assert.equal(gotoFromSearchResults('https://flintsystem.design/', [search, click], observations), true);
  assert.equal(gotoFromSearchResults('https://designlab.com/', [search, click], observations), false, 'a body word is not a title');
  assert.equal(gotoFromSearchResults('https://flintsystem.design/', [search], observations), false, 'the results page itself is not the work page');
});

test('a destination counts as found only when an earlier search result links to or names its site', () => {
  const observations = new Map([
    ['s', observation('Landing gallery', [{ url: 'https://nook.ai.kr/site/1', text: 'Raycast IT/스타트업' }])],
    ['g', observation('Raycast is mentioned on a visited page', [])],
  ]);
  assert.equal(gotoFromSearchResults('https://www.raycast.com/', [event('search', 's')], observations), true);
  assert.equal(gotoFromSearchResults('https://zed.dev/', [event('search', 's')], observations), false);
  assert.equal(gotoFromSearchResults('https://www.raycast.com/', [event('goto', 'g')], observations), false);
  assert.equal(gotoFromSearchResults('https://www.raycast.com/', [], observations), false);
});

test('ref add checks every recorded browse session of the project', async t => {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { projectSearchFound } = await import('../core/ref/browse/provenance.ts');
  const root = mkdtempSync(join(tmpdir(), 'omd-provenance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(projectSearchFound(root, 'https://resend.com'), false);
  const session = join(root, '.omd/discovery/browse/s1');
  mkdirSync(join(session, 'observations'), { recursive: true });
  writeFileSync(join(session, 'trace.jsonl'), `${JSON.stringify({ action: { verb: 'search' }, observation: { sha256: 'o1' } })}\n`);
  writeFileSync(join(session, 'observations/o1.json'), JSON.stringify({ text: 'Gallery', linkClaims: [{ url: 'https://resend.com/', text: 'Email API' }] }));
  assert.equal(projectSearchFound(root, 'https://resend.com'), true);
  assert.equal(projectSearchFound(root, 'https://www.raycast.com'), false);
  // Another page of a site already found and kept from a search is the same discovery, not a pick from memory.
  assert.equal(projectSearchFound(root, 'https://resend.com/pricing'), true, 'linked by the result itself');
  writeFileSync(join(session, 'trace.jsonl'), `${JSON.stringify({ action: { verb: 'search', provider: 'onepagelove' }, observation: { sha256: 'o1' } })}\n`);
  assert.equal(projectSearchFound(root, 'https://openscreenshot.app/compare/'), false, 'not yet kept');
  mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
  const kept = (source: string, name: string) => writeFileSync(join(root, `.omd/refs/design/${name}.json`), JSON.stringify({ researchLane: 'design', source,
    component: 'proof', kind: 'page', capturedAt: '2026-10-23T00:00:00.000Z', invariants: {}, principles: [] }));
  kept('https://openscreenshot.app/?ref=onepagelove', 'openscreenshot');
  assert.equal(projectSearchFound(root, 'https://openscreenshot.app/compare/'), true);
  // A kept page that was itself picked from memory lends nothing to the rest of its site.
  kept('https://www.raycast.com/', 'raycast');
  assert.equal(projectSearchFound(root, 'https://www.raycast.com/store'), false);
});

test('site names use the registrable label and a search proxy names its full-size original', async () => {
  const { siteName, proxiedOriginal } = await import('../core/ref/browse/provenance.ts');
  assert.equal(siteName('i.pinimg.com'), 'pinimg');
  assert.equal(siteName('www.example.co.kr'), 'example');
  assert.equal(siteName('zed.dev'), 'zed');
  assert.equal(proxiedOriginal('https://search.pstatic.net/sunny/?src=https%3A%2F%2Fi.pinimg.com%2Foriginals%2Fa%2Fb.jpg&type=a340'), 'https://i.pinimg.com/originals/a/b.jpg');
  assert.equal(proxiedOriginal('https://cdn.example.com/a.jpg?src=https://x.test/b.jpg'), null);
  assert.equal(proxiedOriginal(null), null);
});

test('a pinterest image search vouches for originals on its image host only', () => {
  const observations = new Map([['s', observation('이미지 검색 결과', [])]]);
  const search = { action: { verb: 'search', provider: 'pinterest' }, observation: { sha256: 's' } } as unknown as BrowseEvent;
  const other = { action: { verb: 'search', provider: 'cosmos' }, observation: { sha256: 's' } } as unknown as BrowseEvent;
  assert.equal(gotoFromSearchResults('https://i.pinimg.com/originals/a/b.jpg', [search], observations), true);
  assert.equal(gotoFromSearchResults('https://i.pinimg.com/originals/a/b.jpg', [other], observations), false);
  assert.equal(gotoFromSearchResults('https://www.raycast.com/', [search], observations), false);
});

test('an original opened directly as an image document can be kept whole', { timeout: 60_000 }, async t => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { browseFixture } = await import('./helpers/browse-fixture.ts');
  const { runBrowseDriver } = await import('../core/ref/browse/driver.ts');
  const { executeBrowseCommand } = await import('../core/ref/browse/client.ts');
  const { parseBrowseCommand } = await import('../core/ref/browse/parser.ts');
  const { createTestProjectRunInvocation, createTestProjectWriteAdapter } = await import('./helpers/project-write.ts');
  const root = mkdtempSync(join(tmpdir(), 'omd-image-document-')), fixture = await browseFixture();
  let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined;
  t.after(async () => { await driver?.close(); await fixture.close(); rmSync(root, { recursive: true, force: true }); });
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const route = { sourceContractSha256: 'a'.repeat(64), request: 'Find graphic references' };
  const dependencies = { launch: async (binding: Parameters<typeof runBrowseDriver>[0]) => driver = await runBrowseDriver(binding, { transport: fixture.transport }) };
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), route, invocation, writer, dependencies);
  await run(['start', '--lane', 'design']);
  const opened = await run(['goto', 'https://app.fixture.test/ui.png', '--reason', 'Open the full-size original of the kept graphic.']);
  assert.equal(opened.ok, true, JSON.stringify(opened.error));
  // A keep straight after opening takes its own whole-screen shot first; here it is then refused for the page's provenance.
  const early = await run(['keep', '--reason', 'Keeping straight after opening the page, before any shot.']).catch((error: Error) => error);
  assert.doesNotMatch(String((early as Error).message ?? JSON.stringify(early)), /keep follows a shot/);
  const shot = await run(['shot', '--selector', 'img']);
  assert.equal(shot.ok, true, JSON.stringify(shot.error));
  assert.deepEqual(shot.observation!.wholeImage && [shot.observation!.wholeImage.width, shot.observation!.wholeImage.height], [300, 160]);
  await run(['end', '--reason', 'complete']);
});

test('a gallery-tagged link or a page clicked through from a search counts as found', () => {
  const observations = new Map([
    ['s', observation('One Page Love search', [])],
    ['c', observation('ByMayo — portfolio', [{ url: 'https://bymayo.co.uk/?ref=onepagelove', text: 'Visit site' }])],
  ]);
  const search = { seq: 1, action: { verb: 'search', provider: 'onepagelove' }, observation: { sha256: 's' } } as unknown as BrowseEvent;
  const click = { seq: 2, action: { verb: 'click' }, observation: { sha256: 'c' } } as unknown as BrowseEvent;
  assert.equal(gotoFromSearchResults('https://bymayo.co.uk/?ref=onepagelove', [search], observations), true, 'gallery ref tag');
  assert.equal(gotoFromSearchResults('https://bymayo.co.uk/', [search], observations), false);
  assert.equal(gotoFromSearchResults('https://bymayo.co.uk/', [search, click], observations), true, 'clicked through');
  assert.equal(gotoFromSearchResults('https://bymayo.co.uk/?ref=onepagelove', [], observations), false, 'no search at all');
  assert.equal(gotoFromSearchResults('https://www.raycast.com/?ref=hackernews', [search, click], observations), false);
});

test('a page of the searched gallery, such as a result cut off at the viewport edge, counts like a click-through', () => {
  const observations = new Map([
    ['s', observation('nook — AI 개발 도구', [{ url: 'https://nook.ai.kr/site/ae28d0e4', text: '' }])],
    ['d', observation('Conductor — Run a team of coding agents', [])],
  ]);
  const search = { seq: 1, action: { verb: 'search', provider: 'nook', query: 'AI 개발 도구' }, finalUrl: 'https://nook.ai.kr/?q=AI', observation: { sha256: 's' } } as unknown as BrowseEvent;
  const detail = { seq: 2, action: { verb: 'goto', url: 'https://nook.ai.kr/site/b71c' }, observation: { sha256: 'd' } } as unknown as BrowseEvent;
  const elsewhere = { seq: 2, action: { verb: 'goto', url: 'https://example.org/conductor-review' }, observation: { sha256: 'd' } } as unknown as BrowseEvent;
  assert.equal(gotoFromSearchResults('https://www.conductor.build/', [search, detail], observations), true);
  assert.equal(gotoFromSearchResults('https://www.conductor.build/', [search, elsewhere], observations), false);
});

test('a site name written with spaces in the results still counts; very short names need an exact mention', () => {
  const observations = new Map([['s', observation('Featured: Contra Labs — creative intelligence', [])]]);
  const search = { seq: 1, action: { verb: 'search', provider: 'nook' }, observation: { sha256: 's' } } as unknown as BrowseEvent;
  assert.equal(gotoFromSearchResults('https://contralabs.com/', [search], observations), true);
  assert.equal(gotoFromSearchResults('https://x.ai/', [search], observations), false);
});

test('searching a remembered name, or a web search engine, does not launder a site into a found one', () => {
  const observations = new Map([['r', observation('Raycast — Your shortcut to everything', [{ url: 'https://www.raycast.com/', text: 'Raycast' }])]]);
  const event = (provider: string, query: string) => ({ seq: 1, action: { verb: 'search', provider, query }, observation: { sha256: 'r' } }) as unknown as BrowseEvent;
  assert.equal(gotoFromSearchResults('https://www.raycast.com/', [event('landbook', 'Raycast')], observations), false);
  assert.equal(gotoFromSearchResults('https://www.raycast.com/', [event('bing', 'developer launcher')], observations), false);
  assert.equal(gotoFromSearchResults('https://www.raycast.com/', [event('landbook', 'developer tools')], observations), true);
});

test('a page opened from memory is refused at keep, unless the user named it', { timeout: 90_000 }, async t => {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { browseFixture } = await import('./helpers/browse-fixture.ts');
  const { runBrowseDriver } = await import('../core/ref/browse/driver.ts');
  const { executeBrowseCommand } = await import('../core/ref/browse/client.ts');
  const { parseBrowseCommand } = await import('../core/ref/browse/parser.ts');
  const { createTestProjectRunInvocation, createTestProjectWriteAdapter } = await import('./helpers/project-write.ts');
  const root = mkdtempSync(join(tmpdir(), 'omd-memory-keep-')), fixture = await browseFixture();
  let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined;
  t.after(async () => { await driver?.close(); await fixture.close(); rmSync(root, { recursive: true, force: true }); });
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const route = { sourceContractSha256: 'a'.repeat(64), request: 'Build a landing page' };
  const dependencies = { launch: async (binding: Parameters<typeof runBrowseDriver>[0]) => driver = await runBrowseDriver(binding, { transport: fixture.transport }) };
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), route, invocation, writer, dependencies);
  await run(['start', '--lane', 'design']);
  await run(['goto', 'https://app.fixture.test/item', '--reason', 'Inspect a remembered product page for its layout.']);
  await run(['shot']);
  const refused = await run(['keep', '--reason', 'Keep the remembered page as the visual direction.']).catch((error: Error) => error);
  assert.match(String((refused as Error).message ?? JSON.stringify(refused)), /BROWSE_KEEP_UNSEARCHED[\s\S]*did not appear in any reference search result/);
  mkdirSync(join(root, '.omd/request-sources'), { recursive: true });
  writeFileSync(join(root, '.omd/request-sources/request.json'), JSON.stringify({ request: 'Make it feel like app.fixture.test' }));
  const kept = await run(['keep', '--reason', 'The user named this page as the visual direction.']);
  assert.equal(kept.ok, true, JSON.stringify(kept.error));
  // After scrolling, a keep with no new shot takes the shot of the screen in view and keeps it.
  await run(['scroll', '--amount', '300']);
  const scrolledKeep = await run(['keep', '--reason', 'The lower section the user pointed at, as it sits on screen.']);
  assert.equal(scrolledKeep.ok, true, JSON.stringify(scrolledKeep.error));
  assert.equal(scrolledKeep.tray?.length ?? 2, 2, 'both screens are kept');
  await run(['end', '--reason', 'complete']);
});

test('on a UI or graphic gallery only the work\'s own image is a reference, not the page around it', async () => {
  const { galleryPageInsteadOfWork } = await import('../core/ref/browse/provenance.ts');
  const work = { width: 1600, height: 1200, originalSha256: 'a'.repeat(64) };
  assert.equal(galleryPageInsteadOfWork({ url: 'https://dribbble.com/shots/20743538-Ngwodink', wholeImage: null }), true);
  assert.equal(galleryPageInsteadOfWork({ url: 'https://dribbble.com/shots/20743538-Ngwodink', wholeImage: work }), false);
  assert.equal(galleryPageInsteadOfWork({ url: 'https://www.behance.net/gallery/1/x', wholeImage: null }), true);
  assert.equal(galleryPageInsteadOfWork({ url: 'https://siter.io/?ref=onepagelove', wholeImage: null }), false, 'a finished site is kept whole');
});

test('a page that animates is still a page the browser can act on', { timeout: 90_000 }, async t => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { browseFixture } = await import('./helpers/browse-fixture.ts');
  const { runBrowseDriver } = await import('../core/ref/browse/driver.ts');
  const { executeBrowseCommand } = await import('../core/ref/browse/client.ts');
  const { parseBrowseCommand } = await import('../core/ref/browse/parser.ts');
  const { createTestProjectRunInvocation, createTestProjectWriteAdapter } = await import('./helpers/project-write.ts');
  const root = mkdtempSync(join(tmpdir(), 'omd-animated-')), fixture = await browseFixture();
  let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined;
  t.after(async () => { await driver?.close(); await fixture.close(); rmSync(root, { recursive: true, force: true }); });
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const route = { sourceContractSha256: 'a'.repeat(64), request: 'Find landing references' };
  const dependencies = { launch: async (binding: Parameters<typeof runBrowseDriver>[0]) => driver = await runBrowseDriver(binding, { transport: fixture.transport }) };
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), route, invocation, writer, dependencies);
  await run(['start', '--lane', 'design']);
  await run(['goto', 'https://app.fixture.test/animated-cookie', '--reason', 'Inspect a moving landing behind its cookie notice.']);
  await new Promise(done => setTimeout(done, 400));
  const cleared = await run(['cookie', '--text', 'Necessary only']);
  assert.notEqual(cleared.error?.code, 'BROWSE_EXTERNAL_INTERVENTION', JSON.stringify(cleared.error));
  // Text that rotates on its own (a cycling headline word) is animation too, not someone else using the page.
  await run(['goto', 'https://app.fixture.test/rotating-cookie', '--reason', 'Inspect a landing whose headline word cycles.']);
  await new Promise(done => setTimeout(done, 400));
  const rotated = await run(['cookie', '--text', 'Necessary only']);
  assert.notEqual(rotated.error?.code, 'BROWSE_EXTERNAL_INTERVENTION', JSON.stringify(rotated.error));
  await run(['end', '--reason', 'complete']);
});

test('a gallery searched in one session still discovers a site whose detail page was opened in the next', async t => {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { projectSearchFound } = await import('../core/ref/browse/provenance.ts');
  const root = mkdtempSync(join(tmpdir(), 'omd-provenance-sessions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const session = (name: string, events: unknown[], observations: Record<string, unknown>) => {
    const directory = join(root, '.omd/discovery/browse', name);
    mkdirSync(join(directory, 'observations'), { recursive: true });
    writeFileSync(join(directory, 'trace.jsonl'), events.map(event => JSON.stringify(event)).join('\n') + '\n');
    for (const [sha, observation] of Object.entries(observations)) writeFileSync(join(directory, 'observations', `${sha}.json`), JSON.stringify(observation));
  };
  session('a', [{ seq: 0, action: { verb: 'search', provider: 'nook', query: 'design' }, url: 'https://nook.ai.kr/search?q=design',
    finalUrl: 'https://nook.ai.kr/search?q=design', observation: { sha256: 'r' } }],
  { r: { text: '디자인 사이트 모음', linkClaims: [{ url: 'https://nook.ai.kr/site/1', text: '교육 플랫폼' }] } });
  assert.equal(projectSearchFound(root, 'https://designlab.com'), false, 'the results alone never named it');
  await new Promise(done => setTimeout(done, 20));
  session('b', [{ seq: 0, action: { verb: 'goto', url: 'https://nook.ai.kr/site/1' }, observation: { sha256: 'd' } }],
    { d: { text: 'Designlab 사이트 방문', linkClaims: [] } });
  assert.equal(projectSearchFound(root, 'https://designlab.com'), true);
  assert.equal(projectSearchFound(root, 'https://zed.dev'), false);
});

test('a site the project\'s own README links is its material, not a memory pick', async t => {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { userNamedSite } = await import('../core/ref/browse/provenance.ts');
  const root = mkdtempSync(join(tmpdir(), 'omd-material-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'oh-my-design'));
  writeFileSync(join(root, 'oh-my-design/README.ko.md'), '랜딩 페이지: https://3x-haust.github.io/oh-my-design/');
  mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
  writeFileSync(join(root, 'node_modules/README.md'), 'https://www.raycast.com');
  assert.equal(userNamedSite(root, 'https://3x-haust.github.io/oh-my-design/'), true);
  assert.equal(userNamedSite(root, 'https://www.raycast.com/'), false, 'dependency READMEs are not the project material');
});
