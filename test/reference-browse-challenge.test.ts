import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { parseBrowseCommand } from '../core/ref/browse/parser.ts';
import { executeBrowseAction, isChallengePage } from '../core/ref/browse/actions.ts';
import type { BrowseAction, BrowseObservation, Start } from '../core/ref/browse/contract.ts';

const start = { verb: 'start', lane: 'design', mode: 'headless', cdpUrl: null, userOptIn: false, headed: false, allowAuthOrigins: [],
  allowPricing: false, budgetActions: 60, budgetMinutes: 10, viewport: { width: 800, height: 600 } } as Start;
const observed = (url: string, dpr = 2) => ({ url, dpr, viewport: { width: 800, height: 600 } }) as unknown as BrowseObservation;
const challenge = (fields: Partial<Extract<BrowseAction, { verb: 'challenge' }>>) =>
  ({ verb: 'challenge', method: 'click', x: null, y: null, toX: null, toY: null, text: null, submit: false, ...fields }) as BrowseAction;

test('challenge commands parse only the options their method needs', () => {
  assert.deepEqual(parseBrowseCommand(['challenge', 'click', '--x', '900', '--y', '660', '--submit']).action,
    { verb: 'challenge', method: 'click', x: 900, y: 660, toX: null, toY: null, text: null, submit: true });
  assert.equal(parseBrowseCommand(['challenge', 'type', '--text', 'xK7m2']).action.verb, 'challenge');
  assert.equal(parseBrowseCommand(['challenge', 'checkbox']).action.verb, 'challenge');
  assert.throws(() => parseBrowseCommand(['challenge', 'drag', '--x', '1', '--y', '1']), /challenge drag takes/);
  assert.throws(() => parseBrowseCommand(['challenge', 'type', '--text', 'rm -rf']), /letters or digits/);
  assert.throws(() => parseBrowseCommand(['challenge', 'type', '--text', 'abc', '--submit']), /challenge type takes/);
  assert.throws(() => parseBrowseCommand(['challenge', 'solve']), /checkbox\|click\|drag\|type/);
});

test('challenge actions work in screenshot pixels on a captcha page, two submits, then hand off', { timeout: 60_000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(`<title>Verify you are human</title><style>body{margin:0}</style>
    <div id="handle" style="position:absolute;left:100px;top:300px;width:40px;height:40px;background:#333"></div>
    <input id="code" style="position:absolute;left:100px;top:100px" autofocus>
    <script>window.log=[];document.addEventListener('click',e=>log.push(['click',e.clientX,e.clientY]));
    let drag=null;handle.onmousedown=e=>drag=e.clientX;document.onmouseup=e=>{if(drag!==null)log.push(['drag',e.clientX-drag]);drag=null};
    code.onkeydown=e=>{if(e.key==='Enter')log.push(['typed',code.value])}</script>`);
  assert.equal(await isChallengePage(page), true);
  const prior = observed(page.url());
  // Tile clicks (no submit) do not spend the two submissions; coordinates halve at DPR 2.
  await executeBrowseAction(page, challenge({ x: 400, y: 400 }), start, prior, 5000);
  await executeBrowseAction(page, challenge({ method: 'drag', x: 240, y: 640, toX: 600, toY: 640 }), start, prior, 5000);
  await page.click('#code');
  await executeBrowseAction(page, challenge({ method: 'type', text: 'xK7m2' }), start, prior, 5000);
  const log = await page.evaluate('window.log') as unknown[][];
  assert.deepEqual(log[0], ['click', 200, 200]);
  assert.deepEqual(log.find(entry => entry[0] === 'drag'), ['drag', 180]);
  assert.deepEqual(log.find(entry => entry[0] === 'typed'), ['typed', 'xK7m2']);
  await assert.rejects(() => executeBrowseAction(page, challenge({ x: 10, y: 10, submit: true }), start, prior, 5000), /BROWSE_CHALLENGE_HANDOFF/);
  await assert.rejects(() => executeBrowseAction(page, challenge({ x: 5000, y: 10 }), start, prior, 5000), /BROWSE_CHALLENGE_TARGET/);
});

test('challenge actions refuse ordinary pages, so they cannot fill forms or click around', { timeout: 60_000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<title>Filter UI designs</title><input name="email">');
  assert.equal(await isChallengePage(page), false);
  await assert.rejects(() => executeBrowseAction(page, challenge({ method: 'type', text: 'abc' }), start, observed(page.url()), 5000), /BROWSE_CHALLENGE_ABSENT/);
});
