import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, rmSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { PNG } from 'pngjs';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
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

function setup(t: TestContext, mode = 'success', thinkingLevel = 'high') {
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
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel, parentSessionId: 'fixture-parent',
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

test('Given the owned Pi system prompt with the exact child cwd When reviewers consume evidence Then two signed results return', { timeout: 30_000 }, async t => {
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
    assert.equal(receipt.reviewerEvidence.sessionId, receipt.sessionId);
    assert.equal(receipt.reviewerEvidence.nonce, receipt.roleNonce);
    assert.equal(receipt.reviewerEvidence?.packetSha256, digest(input.packet));
    assert.equal(receipt.reviewerEvidence?.taskSha256, digest(FINAL_RENDER_REVIEWER_TASK));
  }
  const original = results[0];
  assert.ok(original);
  assert.throws(() => verifySignedPiEyeRoleResult({ ...original, finalMessage: '{}' }, input.root));
  for (const key of ['sessionId', 'nonce'] as const) {
    const changed = structuredClone(original);
    const proof = { ...changed.authority.receipt.reviewerEvidence, [key]: `different-${key}` };
    assert.throws(() => verifySignedPiEyeRoleResult({ ...changed, authority: { ...changed.authority, receipt: { ...changed.authority.receipt, reviewerEvidence: proof } } }, input.root),
      error => error instanceof PiReviewerError && error.code === 'role-authority');
  }
});

test('repair baseline images cannot enter the blind final reviewer', async t => {
  const input = setup(t);
  const trace = observeFixture(t, input.root, () => {});
  const packet = JSON.parse(input.packet.toString('utf8'));
  packet.evidence.priorRenders = [];
  await assert.rejects(() => runPiReviewerLane({
    ...input, packet: Buffer.from(JSON.stringify(packet)), signal: t.signal,
  }), error => error instanceof PiReviewerError && error.code === 'packet-prior-renders');
  assert.deepEqual(trace(), []);
});

test('file-brokered evidence above the inline limit retains whole-packet binding and every image byte', { timeout: 30_000 }, async t => {
  const input = setup(t);
  const trace = observeFixture(t, input.root, () => {});
  const packet = JSON.parse(input.packet.toString('utf8'));
  const png = new PNG({ width: 1024, height: 2048 });
  let seed = 154;
  for (let index = 0; index < png.data.length; index++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    png.data[index] = seed & 255;
  }
  const bytes = PNG.sync.write(png);
  packet.evidence.renders.push({ ...packet.evidence.renders[0],
    width: png.width, height: png.height, captureSha256: digest(bytes), pngBase64: bytes.toString('base64') });
  packet.evidenceSha256 = digest(canonicalJson(packet.evidence));
  packet.outputContract.fixedBindings.evidenceSha256 = packet.evidenceSha256;
  const payload = Buffer.from(`${canonicalJson(packet)}\n`);
  assert.ok(payload.byteLength > 8 * 1024 * 1024 && payload.byteLength < 16 * 1024 * 1024);
  const results = await runPiReviewerLane({ ...input, packet: payload, signal: t.signal });
  const imageHashes = packet.evidence.renders.map((image: { pngBase64: string }) =>
    digest(Buffer.from(image.pngBase64, 'base64')));
  const projectedText = JSON.stringify({
    schema: packet.schema, evidenceSha256: packet.evidenceSha256,
    candidateAlias: packet.evidence.candidateAlias, context: packet.evidence.context,
    observationProjection: packet.evidence.observationProjection, outputContract: packet.outputContract,
  });
  for (const result of results) {
    const { receipt } = verifySignedPiEyeRoleResult(result, input.root);
    assert.equal(receipt.reviewerEvidence.packetSha256, digest(payload));
    const events = trace().filter(event => event.pid === receipt.processPid).map(event => event.event);
    assert.ok(events.includes(`evidence-packet:${digest(projectedText)}`));
    assert.deepEqual(events.filter(event => event.startsWith('evidence-image:')),
      imageHashes.map((hash: string) => `evidence-image:${hash}`));
  }
  assert.equal(digest(payload), digest(Buffer.from(`${canonicalJson(packet)}\n`)));
});

test('file-brokered evidence above its finite limit refuses before launching children', async t => {
  const input = setup(t);
  const trace = observeFixture(t, input.root, () => {});
  await assert.rejects(() => runPiReviewerLane({
    ...input, packet: Buffer.alloc(16 * 1024 * 1024 + 1), signal: t.signal,
  }), error => error instanceof PiReviewerError && error.code === 'packet-too-large');
  assert.deepEqual(trace(), []);
});

test('Given a host returning only the owned system prompt When reviewers consume evidence Then signed results return', { timeout: 30_000 }, async t => {
  const input = setup(t, 'bare-system-prompt');

  const results = await runPiReviewerLane({ ...input, signal: t.signal });

  assert.equal(results.length, 2);
  for (const result of results) verifySignedPiEyeRoleResult(result, input.root);
});

test('Given a medium-thinking Pi host When Eye runs Then its declared high tier is used without replacing the host model', { timeout: 30_000 }, async t => {
  const input = setup(t, 'success', 'medium');
  const results = await runPiReviewerLane({ ...input, signal: t.signal });
  for (const result of results) {
    const { receipt } = verifySignedPiEyeRoleResult(result, input.root);
    assert.equal(receipt.modelReasoningEffort, 'high');
    assert.equal(receipt.provider, 'fixture-provider');
    assert.equal(receipt.model, 'fixture-model');
  }
});

test('a host-generated empty high-effort configuration update is not prior reviewer conversation', { timeout: 30_000 }, async t => {
  const input = setup(t, 'configuration-update', 'medium');
  const results = await runPiReviewerLane({ ...input, signal: t.signal });
  for (const result of results) {
    const { receipt } = verifySignedPiEyeRoleResult(result, input.root);
    assert.equal(receipt.modelReasoningEffort, 'high');
    assert.equal(receipt.model, 'fixture-model');
  }
});

for (const [mode, code, stage] of [
  ['configuration-user-history', 'initial-conversation-history', 'thinking-scoped'],
  ['configuration-guidance', 'initial-conversation-history', 'thinking-scoped'],
  ['configuration-wrong-effort', 'initial-conversation-history', 'thinking-scoped'],
  ['wrong-model', 'state-model-session-or-history', 'state'],
  ['thinking-drift', 'state-model-session-or-history', 'state'],
  ['prehistory', 'state-model-session-or-history', 'state'],
  ['no-ready', 'child-exited:0:', 'ready-omitted'],
  ['failed-final', 'assistant-failed', 'final'],
  ['no-evidence', 'evidence-tool-execution', 'evidence-skipped'],
  ['extra-tool', 'child-isolation', 'ready'],
  ['ambient-system', 'ambient-system-prompt', 'ready'],
  ['wrong-cwd-prompt', 'ambient-system-prompt', 'ready'],
  ['cwd-extra-guidance', 'ambient-system-prompt', 'ready'],
  ['unauthorized-tool', 'evidence-tool-execution', 'evidence'],
  ['session-changed', 'state-model-session-or-history', 'settled'],
  ['images-blocked', 'images-not-delivered', 'evidence'],
  ['extension-error', 'child-context-or-extension-failure', 'evidence'],
  ['auto-compaction', 'child-context-or-extension-failure', 'evidence'],
  ['auto-compaction-event', 'child-context-or-extension-failure', 'evidence'],
] as const) {
  test(`Given Pi reviewer ${mode} When its lane runs Then no signed completion is returned`, { timeout: 15_000 }, async t => {
    const input = setup(t, mode);
    const events = observeFixture(t, input.root, () => undefined);

    await assert.rejects(runPiReviewerLane({ ...input, signal: t.signal }), error => {
      if (!(error instanceof PiReviewerError) || error.code !== code) return false;
      if (mode === 'extension-error' || mode === 'auto-compaction' || mode === 'auto-compaction-event') {
        const expected = {
          'extension-error': { type: 'extension_error', event: 'before_provider_request', error: 'Offline fixture extension failure' },
          'auto-compaction': { type: 'compaction_start', reason: 'threshold' },
          'auto-compaction-event': { type: 'auto_compaction_start', reason: 'overflow' },
        }[mode];
        assert.deepEqual(JSON.parse(error.message.slice(`PI_REVIEWER_REJECTED:${code}:`.length)), expected);
      }
      return true;
    });

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
