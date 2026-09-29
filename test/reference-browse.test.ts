import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { browseFixture } from './helpers/browse-fixture.ts';
import { parseBrowseCommand } from '../core/ref/browse/parser.ts';
import { authorizeBrowseConsent, browseUrl, searchUrl } from '../core/ref/browse/safety.ts';
import { executeBrowseCommand } from '../core/ref/browse/client.ts';
import { runBrowseDriver } from '../core/ref/browse/driver.ts';
import { verifyBrowseSession } from '../core/ref/browse/verification.ts';
import { verifyBrowseRetention } from '../core/ref/browse/retention.ts';
import { readBrowseConfidenceDebtRecord } from '../core/ref/browse/confidence-debt.ts';
import { compareBrowseVectors, browseSaturation, evaluateBrowseStop, BrowseRateLimit } from '../core/ref/browse/budget.ts';
import { VISUAL_VECTOR_AXES } from '../core/visual-vector.ts';
import type { VisualVector } from '../core/visual-vector.ts';
import { loadRefs } from '../core/ref/store.ts';
import { inspectDesignReferenceAdmission } from '../core/ref/design-admission.ts';
import { decodePng } from '../core/motion/energy.ts';
import { readNativeReferenceFlow } from '../core/ref/browse/flow.ts';
import type { BrowseKeep, BrowseResult, Start } from '../core/ref/browse/contract.ts';
import { verifiedCodexBrowseProgress } from '../adapters/codex-browser-operation.ts';

const contract = 'a'.repeat(64);
const route = { sourceContractSha256: contract, request: 'Inspect comparable dashboard references' };
function temp() { return mkdtempSync(join(tmpdir(), 'omd-browse-')); }

test('strict command parsing, URL builders and explicit consent refuse malformed requests', () => {
  for (const argv of [[], ['start', '--lane', 'design', '--mode', 'profile'], ['start', '--lane', 'design', '--headed'], ['click', '--selector', '#x', '--text', 'x'], ['keep', '--reason', 'short'], ['scroll', '--amount', '0'], ['status', '--surprise'], ['status', '--json', '--json'], ['goto', 'http://example.org', '--reason', 'root'], ['start', '--lane', 'domain', '--cdp-url', 'http://127.0.0.1:9222']]) assert.throws(() => parseBrowseCommand(argv));
  assert.equal(searchUrl('https://gallery.example/search?q=old&q=older', 'dense table', 'q'), 'https://gallery.example/search?q=dense+table');
  for (const url of ['https://127.0.0.1/', 'https://foo.local/', 'https://a.example:8443/', 'https://u:p@a.example/', 'https://a.example/?access_token=secret', 'file:///tmp/x']) assert.throws(() => browseUrl(url));
  const start = parseBrowseCommand(['start', '--lane', 'design', '--mode', 'profile', '--user-opt-in']).action as Start;
  assert.throws(() => authorizeBrowseConsent(start, 'ordinary request', contract, Date.now()), /BROWSE_CONSENT_REQUIRED/);
  assert.equal(authorizeBrowseConsent(start, 'omd ref browse start --lane design --mode profile --user-opt-in', contract, Date.now())?.mode, 'profile');
});

test('unknown vector overlap is incomparable, not zero novelty; budgets and rate limits use exact clocks', () => {
  const empty = Object.fromEntries(VISUAL_VECTOR_AXES.map(axis => [axis, null])) as VisualVector;
  const comparison = compareBrowseVectors(empty, empty); assert.equal(comparison.distance, null); assert.equal(comparison.comparable, false);
  const keeps = Array.from({ length: 7 }, (_, index) => ({ source: 'https://one.example/item', image: { path: '', sha256: String(index) }, vector: empty, direction: null })) as BrowseKeep[];
  assert.equal(browseSaturation(keeps), 'unknown');
  const budget = { startedAt: new Date(1000).toISOString(), deadline: new Date(2000).toISOString(), maxActions: 2, actions: 1, metadataEvents: 0 };
  assert.equal(evaluateBrowseStop(budget, 1999), null); assert.equal(evaluateBrowseStop(budget, 2000), 'budget');
  assert.equal(evaluateBrowseStop({ ...budget, actions: 2 }, 1100), 'budget');
  let clock = 0; const rate = new BrowseRateLimit(() => clock); rate.consume('a'); assert.equal(rate.check('a'), 1000); clock = 1000; assert.equal(rate.check('a'), 0);
});

test('real stateful browser: whole-screen keeps, attached details, original item image, signed trace and tray PNG', { timeout: 120_000 }, async t => {
  const previousTrace = process.env.OMD_BROWSE_RPC_TRACE; process.env.OMD_BROWSE_RPC_TRACE = '1';
  const root = temp(), fixture = await browseFixture(), drivers: Awaited<ReturnType<typeof runBrowseDriver>>[] = [];
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  let clock = 0;
  const dependencies = { launch: async (binding: Parameters<typeof runBrowseDriver>[0]) => {
    const driver = await runBrowseDriver(binding, { transport: fixture.transport, monotonic: () => clock += 1001 }); drivers.push(driver); return driver;
  } };
  const transcript: { command: string[]; outcome: string; keeps: number }[] = [];
  const run = async (args: string[]) => {
    const result = await executeBrowseCommand(root, parseBrowseCommand(args), route, invocation, writer, dependencies);
    transcript.push({ command: ['omd', 'ref', 'browse', ...args], outcome: result.outcome, keeps: result.tray.length }); return result;
  };
  try {
    const started = await run(['start', '--lane', 'design', '--viewport', '640x800']); assert.equal(started.ok, true);
    assert.equal(statSync(join(root, `.omd/.cache/ref-browse/${started.sessionId}`)).mode & 0o777, 0o700);
    assert.equal(statSync(join(root, `.omd/.cache/ref-browse/${started.sessionId}/state.json`)).mode & 0o777, 0o600);
    await assert.rejects(run(['start', '--lane', 'domain']), /BROWSE_SESSION_BUSY/);
    const search = await run(['search', 'https://design.fixture.test/search', 'dashboard layout']); assert.equal(search.ok, true, JSON.stringify(search.error));
    await run(['click', '--selector', '#gallery']);
    const firstScroll = await run(['scroll', '--amount', '500']); assert.ok(firstScroll.observation!.scroll.y > 0);
    const scrolled = await run(['scroll', '--amount', '500']);
    assert.ok(scrolled.observation!.controls.some(control => control.selector === '#related'), 'recorded second scroll frames the newly appended related item');
    const backToTop = await run(['scroll', '--direction', 'up', '--amount', '500']); assert.equal(backToTop.ok, true, JSON.stringify(backToTop.error));
    const item = await run(['click', '--selector', '#item']); assert.equal(item.ok, true, JSON.stringify(item.error));
    const orphan = await run(['crop', '--selector', '#component']); assert.equal(orphan.ok, false); assert.match(orphan.error!.code, /DETAIL_PARENT/);
    const shot = await run(['shot']); assert.equal(shot.ok, true, JSON.stringify(shot.error));
    const keep = await run(['keep', '--source-app', 'Fixture Service', '--rights', 'allowed', '--reason', 'The full account overview makes the task hierarchy and content density visible.']); assert.equal(keep.ok, true, JSON.stringify(keep.error));
    const detail = await run(['crop', '--selector', '#component']); assert.equal(detail.ok, true, JSON.stringify(detail.error)); assert.equal(detail.tray[0]!.details.length, 1);
    const rejectDetail = await run(['keep', '--capture', detail.head!, '--reason', 'This detail cannot replace its whole-screen parent reference.']); assert.equal(rejectDetail.ok, false);
    assert.equal(await run(['click', '--selector', '#tab']).then(result => result.ok), true);
    const state = await run(['shot', '--screen-id', 'details', '--state', 'details open', '--assert-visible', '#details', '--assert-hidden', '#overview']); assert.equal(state.ok, true, JSON.stringify(state.error));
    assert.match(state.observation!.text, /Selected details persist/);
    const checkout = await run(['click', '--selector', '#checkout']); assert.equal(checkout.ok, false); assert.equal(fixture.requests.some(request => request.includes('/checkout')), false);
    const full = await run(['shot', '--selector', '#ui']); assert.equal(full.ok, true, JSON.stringify(full.error)); assert.deepEqual(full.observation!.wholeImage && { width: full.observation!.wholeImage.width, height: full.observation!.wholeImage.height }, { width: 300, height: 160 });
    assert.equal(full.capture!.scope, 'whole-screen'); assert.equal(decodePng(readFileSync(join(root, full.capture!.image.path))).width, 300, 'original resolution, not the 150px gallery thumbnail');
    const imageKeep = await run(['keep', '--rights', 'allowed', '--reason', 'The complete original dashboard screen shows the sidebar and work area together.']); assert.equal(imageKeep.ok, true, JSON.stringify(imageKeep.error));
    const duplicate = await run(['keep', '--reason', 'A second judgment on these same pixels is a duplicate, not another direction.']); assert.equal(duplicate.tray.length, 3);
    const dropped = await run(['drop', duplicate.head!, '--reason', 'Drop the duplicate whole screen because it adds no independent evidence.']); assert.equal(dropped.tray.length, 2);
    const beforeStatus = dropped.head; assert.equal((await run(['status'])).head, beforeStatus);
    const similar = await run(['similar', '--selector', '#similar']); assert.equal(similar.ok, true, JSON.stringify(similar.error)); assert.match(similar.observation!.url, /\/other$/);
    const back = await run(['back']); assert.equal(back.ok, true, JSON.stringify(back.error)); assert.match(back.observation!.url, /\/item$/);
    await run(['goto', 'https://design.fixture.test/cookie', '--reason', 'Inspect the page without hiding its consent obstruction.']);
    const obstructed = await run(['shot']); assert.equal(obstructed.observation!.retainable, false); assert.ok(obstructed.observation!.obstructions.length > 0);
    assert.equal((await run(['keep', '--reason', 'The consent overlay is not a useful real-app reference screen.'])).ok, false);
    const sheet = await run(['contact-sheet']); assert.equal(sheet.ok, true, JSON.stringify(sheet.error));
    assert.ok(sheet.contactSheet?.image.path.endsWith('.png')); assert.ok(sheet.contactSheet?.metadata.path.endsWith('.json'));
    assert.equal(loadRefs(root).length, 0, 'no provisional tray item enters retained namespace');
    const ended = await run(['end']); assert.equal(ended.ok, true, JSON.stringify(ended.error)); assert.ok(ended.seal); assert.equal(ended.retained!.length, 2);
    const refs = loadRefs(root); assert.equal(refs.length, 2);
    for (const ref of refs) {
      assert.equal(ref.referenceUnit, 'whole-screen'); assert.equal(verifyBrowseRetention(root, ref).reference.source, 'https://design.fixture.test/item');
      assert.equal(inspectDesignReferenceAdmission(root, ref).eligible, true, 'unknown provider admitted by native trace');
    }
    const fullImage = refs.find(ref => ref.kind === 'image')!; assert.equal(fullImage.viewport, undefined, 'image pixels do not invent the pictured app CSS viewport or DPR'); assert.equal(fullImage.invariants, null);
    const verified = verifyBrowseSession(root, ended.seal!); assert.equal(verified.seal.keeps.length, 2);
    const sheetReceipt = verified.seal.assets.find(receipt => receipt.path.includes('/sheets/') && receipt.path.endsWith('.png'))!;
    const png = decodePng(readFileSync(join(root, sheetReceipt.path))); assert.equal(png.width, 1080); assert.equal(png.height, 320);
    const debt = readBrowseConfidenceDebtRecord(root, contract); assert.equal(debt.schema, 'confidence-debt-v1'); assert.ok(debt.items.every(item => item.stage === 'scout' && item.claim === 'not-verified'));
    assert.deepEqual((await run(['end'])).seal, ended.seal, 'end is idempotent');
    t.diagnostic(`recorded-session-transcript ${JSON.stringify(transcript)}`);
    const tracePath = join(root, verified.seal.trace.path), original = readFileSync(tracePath); writeFileSync(tracePath, original.subarray(0, original.length - 1));
    assert.throws(() => verifyBrowseSession(root, ended.seal!), /BROWSE_DIGEST/); writeFileSync(tracePath, original);
    const ref = refs[0]!; assert.throws(() => verifyBrowseRetention(root, { ...ref, source: 'https://forged.example/' }), /PROJECTION/);
  } finally {
    for (const driver of drivers) await driver.close(); await fixture.close(); rmSync(root, { recursive: true, force: true });
    if (previousTrace === undefined) delete process.env.OMD_BROWSE_RPC_TRACE; else process.env.OMD_BROWSE_RPC_TRACE = previousTrace;
  }
});

test('verified adapter progress uses the latest cumulative cycle counter across lane sessions', { timeout: 90_000 }, async () => {
  const root = temp(), fixture = await browseFixture();
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const drivers: Awaited<ReturnType<typeof runBrowseDriver>>[] = [];
  const dependencies = { launch: async (binding: Parameters<typeof runBrowseDriver>[0]) => {
    const driver = await runBrowseDriver(binding, { transport: fixture.transport }); drivers.push(driver); return driver;
  } };
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), route, invocation, writer, dependencies);
  try {
    await run(['start', '--lane', 'design', '--budget-actions', '8']);
    await run(['goto', 'https://app.fixture.test/cookie', '--reason', 'Inspect one complete design screen before changing research lanes.']);
    const first = await run(['end', '--reason', 'complete']);
    assert.equal(first.budget.actions, 1);
    await run(['start', '--lane', 'domain', '--budget-actions', '8']);
    await run(['goto', 'https://app.fixture.test/cookie', '--reason', 'Inspect one comparable domain task before ending the bounded cycle.']);
    const second = await run(['end', '--reason', 'complete']);
    assert.equal(second.budget.actions, 2);
    const progress = verifiedCodexBrowseProgress(root, { sourceContractSha256: contract });
    assert.equal(progress.sealedSessionCount, 2);
    assert.equal(progress.actionsUsed, 2);
    assert.equal(progress.actionsRemaining, 6);
  } finally { for (const driver of drivers) await driver.close(); await fixture.close(); rmSync(root, { recursive: true, force: true }); }
});

test('authority refusal has no mutation; budget stops acquisition but seals honest debt', { timeout: 60_000 }, async () => {
  const root = temp(), fixture = await browseFixture(); let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined;
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const dependencies = { launch: async (binding: Parameters<typeof runBrowseDriver>[0]) => driver = await runBrowseDriver(binding, { transport: fixture.transport }) };
  try {
    const before = readdirSync(root);
    await assert.rejects(executeBrowseCommand(root, parseBrowseCommand(['start', '--lane', 'domain']), route, invocation, {} as typeof writer, dependencies), /trusted immutable/);
    assert.deepEqual(readdirSync(root), before);
    const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), route, invocation, writer, dependencies);
    await run(['start', '--lane', 'domain', '--budget-actions', '1']);
    assert.equal((await run(['goto', 'https://app.fixture.test/cookie', '--reason', 'Inspect the service entry and its real consent obstruction.'])).ok, true);
    const blocked = await run(['shot']); assert.equal(blocked.outcome, 'budget-exhausted');
    const end = await run(['end', '--reason', 'budget']); assert.equal(end.retained!.length, 0); assert.ok(end.confidenceDebt!.some(item => item.code === 'budget-exhausted'));
    assert.ok(readBrowseConfidenceDebtRecord(root, contract).items.some(item => item.kind === 'budget-exhausted'));
    await assert.rejects(run(['start', '--lane', 'design', '--budget-actions', '1']), /BROWSE_CYCLE_BUDGET/);
  } finally { await driver?.close(); await fixture.close(); rmSync(root, { recursive: true, force: true }); }
});

test('domain walkthrough projects real same-context asserted transitions, not disconnected screenshots', { timeout: 60_000 }, async () => {
  const root = temp(), fixture = await browseFixture(); let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined, clock = 0;
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const dependencies = { launch: async (binding: Parameters<typeof runBrowseDriver>[0]) => driver = await runBrowseDriver(binding, { transport: fixture.transport, monotonic: () => clock += 1001 }) };
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), route, invocation, writer, dependencies);
  try {
    await run(['start', '--lane', 'domain']);
    await run(['goto', 'https://app.fixture.test/item', '--reason', 'Inspect the live account overview and details interaction.', '--source-id', 'app', '--flow-id', 'inspect-account']);
    await run(['shot', '--screen-id', 'overview', '--state', 'overview', '--assert-visible', '#overview']);
    await run(['click', '--selector', '#tab']);
    await run(['shot', '--screen-id', 'details', '--state', 'details', '--assert-visible', '#details']);
    const ended = await run(['end']); assert.equal(ended.ok, true, JSON.stringify(ended.error));
    const summary = JSON.parse(readFileSync(join(root, `.omd/discovery/browse/${ended.sessionId}/summary.json`), 'utf8'));
    const flow = readNativeReferenceFlow(root, summary.flows[0]); assert.equal(flow.status, 'completed'); assert.equal(flow.steps[1]!.action, 'click: #tab'); assert.equal(flow.steps.length, 2);
  } finally { await driver?.close(); await fixture.close(); rmSync(root, { recursive: true, force: true }); }
});
