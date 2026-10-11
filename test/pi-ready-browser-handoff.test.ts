import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleOmdMessageEnd, readyBridgeQuestion } from '../extensions/omd-message-end.ts';
import { RepairLoop } from '../extensions/omd-repair-progress.ts';
import { browserProfilePath, readBrowserConsent, readUserBrowserConsent, writeBrowserConsent, writeUserBrowserConsent } from '../core/ref/browser-consent.ts';
import { installUserBrowserBridge } from '../core/browser/setup.ts';
import { selectReferenceAcquisitionEngine, readReferenceBrowserConfig } from '../core/ref/browser-config.ts';
import type { UserBrowserDriver } from '../core/browser/contracts.ts';
import type { PortablePiApi } from '../extensions/omd-runtime.ts';

const ready = { state: 'ready' as const, browser: { id: 'aside', label: 'Aside' }, candidates: [], defaultBrowser: { label: 'Aside', supported: true } };
const stage = { schema: 'stage-next-v2', stage: 'reference-board', owner: 'omd-scout', action: 'acquire-reference',
  next: 'omd ref work-next --json', instruction: 'Inspect a finished site', problems: [], entryBlockers: [],
  progress: { routeSha256: 'a'.repeat(64), validatedStages: [] },
  referenceWork: { schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'b'.repeat(64),
    action: { kind: 'direct-entry', lane: 'design', url: 'https://www.siteinspire.com/',
      args: ['ref', 'advance', '--json'], reason: 'Visit a real site' }, attempts: [], exclusions: [], circuits: [], code: null } };

test('ready bundled Aside bridge asks once before a profile-backed reference action, then continues without manual Enable', async t => {
  const home = mkdtempSync(join(tmpdir(), 'omd-ready-bridge-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(browserProfilePath(home), { recursive: true });
  writeBrowserConsent('consented', home);
  assert.equal(readUserBrowserConsent(home), null, 'profile consent is not user-browser consent');
  assert.equal(await readyBridgeQuestion(home, async () => ready, undefined, false), null, 'background browsing needs no everyday-browser consent');
  assert.equal((await readyBridgeQuestion(home, async () => ready, undefined, true))?.kind, 'browser-consent');
  const calls: string[][] = []; const messages: Array<{ customType?: string; content?: unknown }> = [];
  const choices: string[][] = [];
  const driver: UserBrowserDriver = {
    userBrowserBridgeDoctor: async () => ({ ready: true, cli: { installed: true }, daemon: { running: true },
      identification: { needsChoice: false, candidates: [], defaultBrowser: { label: 'Aside', supported: true } },
      primary: { id: 'aside', label: 'Aside' }, browsers: [{}] }),
    userBrowserBridgeOnboard: async () => { throw Error('ready bridge must not request Enable'); },
    connectUserBrowserSession: async () => { throw Error('connection belongs to subsequent acquisition'); },
  };
  const setup = await installUserBrowserBridge(undefined, driver);
  assert.equal(setup.state, 'ready');
  const outcome = await handleOmdMessageEnd({ cwd: home, browserConsentHome: home,
    message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'research pending' }] },
    hasRoute: true, workflowStarted: true, ownedWorkStarted: true, productionAttempted: false, revision: 0,
    routeRevision: 'a'.repeat(64), repairLoop: new RepairLoop(), interrupted: () => false,
    browserDoctor: async () => ready, explicitUserBrowser: true,
    ui: { select: async (_title, options) => { choices.push(options); return '평소 쓰는 브라우저 그대로 쓰기'; } },
    pi: { sendMessage: message => { messages.push(message); }, registerTool() {}, registerCommand() {},
      exec: async () => ({ stdout: '', stderr: '', code: 0, killed: false }) } satisfies PortablePiApi,
    run: async args => {
      calls.push([...args]);
      if (args[0] === 'stage') return { text: JSON.stringify(stage), details: { code: 0, killed: false } };
      if (args[0] === 'browser' && args[1] === 'setup') {
        assert.deepEqual(args, ['browser', 'setup', '--engine', 'user-browser', '--consent', '--json']);
        writeUserBrowserConsent('consented', home);
        return { text: JSON.stringify({ schema: 'omd-browser-setup-v2', engine: 'user-browser', state: 'ready' }),
          details: { code: 0, killed: false } };
      }
      throw Error(`unexpected command ${args.join(' ')}`);
    },
  }) as { message: { content: Array<{ text?: string }> } };
  assert.equal(choices.length, 1);
  assert.equal(calls.some(args => args[0] === 'ref'), false, 'no browsing before explicit user choice');
  assert.equal(readBrowserConsent(home), 'consented');
  assert.equal(readUserBrowserConsent(home), 'consented');
  assert.equal(await readyBridgeQuestion(home, async () => ready, undefined, true), null, 'consent is not requested again');
  assert.equal(messages[0]?.customType, 'omd-browser-ready');
  assert.match(outcome.message.content.at(-1)?.text ?? '', /"state":"ready"/);
  assert.equal(await selectReferenceAcquisitionEngine(readReferenceBrowserConfig({}, home), { home, driver, explicitUserBrowser: true }), 'user-browser');
});
