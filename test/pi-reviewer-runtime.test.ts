import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, rmSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { runPiReviewerLane } from '../adapters/pi-reviewer-runtime.ts';
import { PiReviewerError } from '../adapters/pi-reviewer-contract.ts';
import { verifySignedPiEyeRoleResult } from '../core/runtime/pi-role-receipt.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { FINAL_RENDER_REVIEWER_TASK, finalRenderReviewerPacket } from '../core/runtime/final-render-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const cliPath = fileURLToPath(new URL('./fixtures/pi-reviewer-rpc.mjs', import.meta.url));
const nodePath = realpathSync(process.execPath);
type FixtureEvent = Readonly<{ event: string; pid: number }>;

function setup(t: TestContext, mode = 'success') {
  const { root: fixtureRoot, invocation: base, observationSha256s } = prepareFinalRenderReviewFixture();
  const root = realpathSync(fixtureRoot);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previousMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = mode;
  t.after(() => {
    if (previousMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previousMode;
  });
  const host = {
    nodePath, nodeSha256: digest(readFileSync(nodePath)), cliPath, cliSha256: digest(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'fixture-parent',
  };
  const invocation = createTestNativePiInvocation({ root, host, current: base.current });
  const packet = finalRenderReviewerPacket({ root, invocation: base, packetInput: {
    schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s,
  } });
  return { root, invocation, packet, task: FINAL_RENDER_REVIEWER_TASK, lane: 'blindLane' as const };
}

function observeFixture(t: TestContext, root: string, observe: (event: FixtureEvent) => void): () => readonly FixtureEvent[] {
  const tracePath = join(root, 'reviewer-trace.jsonl');
  writeFileSync(tracePath, '');
  const previousTrace = process.env.PI_REVIEWER_FIXTURE_TRACE;
  process.env.PI_REVIEWER_FIXTURE_TRACE = tracePath;
  t.after(() => {
    if (previousTrace === undefined) delete process.env.PI_REVIEWER_FIXTURE_TRACE;
    else process.env.PI_REVIEWER_FIXTURE_TRACE = previousTrace;
  });
  const read = (): readonly FixtureEvent[] => readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const event: unknown = JSON.parse(line);
    assert.ok(typeof event === 'object' && event !== null && 'event' in event && typeof event.event === 'string'
      && 'pid' in event && typeof event.pid === 'number');
    return { event: event.event, pid: event.pid };
  });
  const watcher = watch(tracePath, () => read().forEach(observe));
  t.after(() => watcher.close());
  return read;
}

test('Given a fresh Pi reviewer lane When its children consume evidence Then two independently signed results are returned', { timeout: 30_000 }, async t => {
  const input = setup(t);

  const results = await runPiReviewerLane({ ...input, signal: t.signal });

  assert.equal(results.length, 2);
  const verified = results.map(result => verifySignedPiEyeRoleResult(result, input.root));
  assert.equal(new Set(verified.map(result => result.receipt.processPid)).size, 2);
  assert.equal(new Set(verified.map(result => result.receipt.sessionId)).size, 2);
  assert.equal(new Set(verified.map(result => result.receipt.roleNonce)).size, 2);
  assert.equal(new Set(verified.map(result => result.receipt.reviewerEvidence.childPid)).size, 2);
  for (const { receipt } of verified) {
    assert.equal(receipt.schema, 'omd-pi-role-exec-result-v1');
    assert.equal(receipt.provider, 'fixture-provider');
    assert.equal(receipt.model, 'fixture-model');
    assert.equal(receipt.modelReasoningEffort, 'high');
    assert.equal(receipt.modelSelection, 'inherited-pi-host');
    assert.notEqual(receipt.processPid, process.pid);
    assert.notEqual(receipt.sessionId, 'fixture-parent');
    assert.equal(receipt.reviewerEvidence?.packetSha256, digest(input.packet));
    assert.equal(receipt.reviewerEvidence?.taskSha256, digest(FINAL_RENDER_REVIEWER_TASK));
  }
  const original = results[0];
  assert.ok(original);
  assert.throws(() => verifySignedPiEyeRoleResult({ ...original, finalMessage: '{}' }, input.root));
});

for (const [mode, code, stage] of [
  ['wrong-model', 'state-model-session-or-history', 'state'],
  ['prehistory', 'state-model-session-or-history', 'state'],
  ['no-ready', 'child-exited:0:', 'ready-omitted'],
  ['failed-final', 'assistant-failed', 'final'],
  ['no-evidence', 'evidence-tool-execution', 'evidence-skipped'],
  ['extra-tool', 'child-isolation', 'ready'],
  ['ambient-system', 'ambient-system-prompt', 'ready'],
  ['unauthorized-tool', 'evidence-tool-execution', 'evidence'],
  ['session-changed', 'state-model-session-or-history', 'settled'],
  ['images-blocked', 'images-not-delivered', 'evidence'],
  ['extension-error', 'child-context-or-extension-failure', 'evidence'],
  ['auto-compaction', 'child-context-or-extension-failure', 'evidence'],
] as const) {
  test(`Given Pi reviewer ${mode} When its lane runs Then no signed completion is returned`, { timeout: 15_000 }, async t => {
    const input = setup(t, mode);
    const events = observeFixture(t, input.root, () => undefined);

    await assert.rejects(runPiReviewerLane({ ...input, signal: t.signal }), error =>
      error instanceof PiReviewerError && error.code === code);

    assert.ok(events().some(event => event.event === stage), `fixture reached ${stage}`);
  });
}

test('Given agent_end without settlement When RPC remains live Then completion waits until caller cancellation', { timeout: 15_000 }, async t => {
  const input = setup(t, 'no-settled');
  const controller = new AbortController();
  let deadline: NodeJS.Timeout | undefined;
  let reachedUnsettled = false;
  observeFixture(t, input.root, event => {
    if (event.event !== 'unsettled' || reachedUnsettled) return;
    reachedUnsettled = true;
    deadline = setTimeout(() => controller.abort(), 1_000);
  });
  t.after(() => clearTimeout(deadline));

  await assert.rejects(runPiReviewerLane({ ...input, signal: AbortSignal.any([controller.signal, t.signal]) }), /cancelled/);

  assert.equal(reachedUnsettled, true);
});

test('Given a running Pi reviewer When its caller aborts Then the child is stopped without signed completion', { timeout: 15_000 }, async t => {
  const input = setup(t, 'hang');
  const controller = new AbortController();
  const childPids = new Set<number>();
  let reachedActive = false;
  observeFixture(t, input.root, event => {
    childPids.add(event.pid);
    if (event.event !== 'active') return;
    reachedActive = true;
    controller.abort();
  });

  await assert.rejects(runPiReviewerLane({ ...input, signal: AbortSignal.any([controller.signal, t.signal]) }), /cancelled/);

  assert.equal(reachedActive, true);
  assert.ok(childPids.size > 0);
  for (const pid of childPids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
