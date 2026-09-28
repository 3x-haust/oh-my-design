import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBrowserAnswerReceipt, writeBrowserAnswerReceipt } from '../core/ref/browser-consent.ts';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

test('CLI status is read-only; setup relays pending human step from an injected local driver', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-cli-browser-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'); const bundle = join(root, 'driver');
  mkdirSync(home); mkdirSync(bundle);
  writeFileSync(join(bundle, 'package.json'), '{"type":"module"}');
  const index = `export async function userBrowserBridgeDoctor(){return {ready:false,cli:{installed:true},daemon:{running:true},identification:{needsChoice:false,defaultBrowser:{label:'Aside',supported:true},candidates:[{id:'aside',label:'Aside',signals:['default']}]},primary:{id:'aside',label:'Aside'},browsers:[{}]}}\nexport async function userBrowserBridgeOnboard(){return {ready:false,humanStep:'Quit Aside and open it again; click Enable.'}}\nexport async function connectUserBrowserSession(){throw Error('must not connect')}\n`;
  writeFileSync(join(bundle, 'index.js'), index); writeFileSync(join(bundle, 'page-bundle.js'), '');
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({ schema: 1, component: 'omd-browser', files: {
    'index.js': sha(index), 'page-bundle.js': sha('') } }));
  const env = { ...process.env, HOME: home, OMD_BROWSER_DRIVER_PATH: bundle };
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, 'browser', ...args], { cwd: root, env, encoding: 'utf8' });
  const before = run('status', '--json');
  assert.equal(before.status, 0, before.stderr);
  const doctor = JSON.parse(before.stdout).userBrowser;
  assert.equal(doctor.browser.id, 'aside');
  assert.equal(doctor.state, 'extension-not-connected');
  assert.equal(readFileSync(join(bundle, 'index.js'), 'utf8'), index);
  const denied = run('setup', '--engine', 'user-browser', '--json');
  assert.notEqual(denied.status, 0);
  const emptyAnswer = run('setup', '--engine', 'user-browser', '--consent', '--user-answer', '');
  assert.notEqual(emptyAnswer.status, 0);
  assert.match(emptyAnswer.stderr, /OMD_BROWSER_SETUP_CONSENT_REQUIRED/);
  const unseen = run('setup', '--engine', 'user-browser', '--consent', '--user-answer', '평소 쓰는 브라우저', '--json');
  assert.notEqual(unseen.status, 0);
  assert.match(unseen.stderr, /OMD_BROWSER_SETUP_CONSENT_REQUIRED/);
  const setup = run('setup', '--engine', 'user-browser', '--consent', '--json');
  assert.equal(setup.status, 0, setup.stderr);
  assert.deepEqual(JSON.parse(setup.stdout), { schema: 'omd-browser-setup-v2', engine: 'user-browser',
    state: 'pending-human-step', humanStep: 'Quit Aside and open it again; click Enable.',
    candidates: [{ id: 'aside', label: 'Aside', signals: ['default'] }] });
  writeBrowserAnswerReceipt({ questionDigest: 'a'.repeat(64), userText: '세팅 하라고' }, home);
  const interpreted = run('setup', '--engine', 'user-browser', '--consent', '--user-answer', '세팅 하라고', '--json');
  assert.equal(interpreted.status, 0, interpreted.stderr);
  assert.equal(readBrowserAnswerReceipt(home), undefined);
  const replay = run('setup', '--engine', 'user-browser', '--consent', '--user-answer', '세팅 하라고', '--json');
  assert.notEqual(replay.status, 0);
  assert.match(replay.stderr, /OMD_BROWSER_SETUP_CONSENT_REQUIRED/);
  const after = JSON.parse(run('status', '--json').stdout);
  assert.equal(after.userBrowserConsent, 'consented');
  assert.equal(after.userBrowser.state, 'extension-not-connected');
});
