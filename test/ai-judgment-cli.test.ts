import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJudgmentCommand } from '../bin/judgment-command.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { capturePiRequest, capturePiUserTurn, requestDigest } from '../extensions/omd-request-source.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const fixture = () => JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/adaptive-flow/copy-only.json', import.meta.url)), 'utf8'));
test('schema ai-judgment writes a current publishable starter for request and continuation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-judgment-starter-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = fixture();
  publishTestAdaptiveRoute(root, input);
  capturePiRequest(root, input.request);
  const cli = (...args: string[]) => JSON.parse(execFileSync(process.execPath,
    [fileURLToPath(new URL('../bin/omd.mjs', import.meta.url)), ...args, '--json'],
    { cwd: root, encoding: 'utf8' }));
  const starter = cli('schema', 'ai-judgment', '--purpose', 'workflow-intent');
  assert.equal(starter.path, '.omd/.cache/ai-judgment-workflow-intent.json');
  assert.deepEqual(starter.decisions, ['implement', 'inspect', 'skill-only', 'other']);
  assert.equal(starter.skeleton.quotes[0].field, 'request');
  assert.equal(starter.skeleton.context.requestSha256, sha(input.request));
  assert.equal(readFileSync(join(root, starter.path), 'utf8').trim(), JSON.stringify(starter.skeleton, null, 2));
  const published = cli('ai-judgment', 'publish', '--input', starter.path);
  assert.equal(cli('ai-judgment', 'check', '--judgment', published.receipt.path).judgment.decision, 'implement');
  const turn = capturePiUserTurn(root, { text: 'Continue implementation', sessionId: 'session', turnId: 'turn', afterStopId: 'stop' });
  const next = cli('schema', 'ai-judgment', '--purpose', 'workflow-continuation');
  assert.equal(next.skeleton.context.questionDigest, null);
  assert.equal(next.skeleton.payload.routeSha256, turn.routeSha256);
  assert.equal(next.skeleton.quotes[0].text, turn.text);
  const resumed = cli('ai-judgment', 'publish', '--input', next.path);
  assert.equal(cli('ai-judgment', 'check', '--judgment', resumed.receipt.path).judgment.decision, 'resume');
});

test('CLI publishes a request-bound target-market without using route-bound context', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-market-judgment-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = fixture();
  const invocation = publishTestAdaptiveRoute(root, input);
  const source = capturePiRequest(root, input.request);
  const judgment = { schema: 'ai-judgment-v1', purpose: 'target-market', subjectId: 'request',
    context: { requestSha256: source.requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256: null },
    decision: 'unspecified', reason: 'Agent did not claim a market',
    quotes: [{ source: { kind: 'route-request', requestSourceSha256: source.recordSha256, requestSha256: source.requestSha256 }, field: 'request', itemId: null, text: input.request }],
    evidence: [], payload: {} };
  const path = join(root, 'market.json'); writeFileSync(path, JSON.stringify(judgment));
  const published = await runJudgmentCommand(root, invocation, 'publish', path, createTestProjectWriteAdapter(root, invocation));
  const checked = await runJudgmentCommand(root, invocation, 'check', published.receipt.path);
  assert.ok(checked.judgment);
  assert.equal(checked.judgment.decision, 'unspecified');
});

test('CLI continuation quotes the exact signed real turn and binds the current route', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-continuation-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = fixture();
  const invocation = publishTestAdaptiveRoute(root, input);
  const source = capturePiRequest(root, input.request);
  const route = readPersistedRoute(root, invocation);
  const routeSha256 = requestDigest(readFileSync(join(root, '.omd/route.json'), 'utf8'));
  const turn = capturePiUserTurn(root, { text: '이어서 구현해 주세요', sessionId: 'real-session', turnId: 'turn-1', afterStopId: 'stop-1' });
  const judgment = { schema: 'ai-judgment-v1', purpose: 'workflow-continuation', subjectId: turn.turnId,
    context: { requestSha256: source.requestSha256, sourceContractSha256: route.sourceContractSha256, questionDigest: null, documentSha256: null },
    decision: 'resume', reason: 'Agent interpretation', quotes: [{ source: { kind: 'user-turn', sessionId: turn.sessionId,
      turnId: turn.turnId, sha256: turn.sha256 }, field: 'text', itemId: null, text: turn.text }], evidence: [], payload: { routeSha256 } };
  const path = join(root, 'continuation.json'); writeFileSync(path, JSON.stringify(judgment));
  const writer = createTestProjectWriteAdapter(root, invocation);
  const published = await runJudgmentCommand(root, invocation, 'publish', path, writer);
  assert.equal((await runJudgmentCommand(root, invocation, 'check', published.receipt.path)).judgment?.decision, 'resume');
  writeFileSync(path, JSON.stringify({ ...judgment, quotes: [{ ...judgment.quotes[0], text: 'fabricated turn' }] }));
  await assert.rejects(runJudgmentCommand(root, invocation, 'publish', path, writer), /AI_JUDGMENT_QUOTE_MISMATCH/);
  capturePiUserTurn(root, { text: '멈춰 주세요', sessionId: 'real-session', turnId: 'turn-2', afterStopId: 'stop-1' });
  await assert.rejects(runJudgmentCommand(root, invocation, 'check', published.receipt.path), /AI_JUDGMENT_SOURCE_UNVERIFIED|AI_JUDGMENT_SOURCE_STALE/);
});

test('CLI publishes only quoted current native request judgments and checks immutable records', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-ai-judgment-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = fixture();
  const invocation = publishTestAdaptiveRoute(root, input);
  const source = capturePiRequest(root, input.request);
  const route = readPersistedRoute(root, invocation);
  const record = { schema: 'ai-judgment-v1', purpose: 'design-language-reading', subjectId: 'request',
    context: { requestSha256: source.requestSha256, sourceContractSha256: route.sourceContractSha256, questionDigest: null, documentSha256: null },
    decision: 'resolved', reason: 'Chosen reading of the real request',
    quotes: [{ source: { kind: 'route-request', requestSourceSha256: source.recordSha256, requestSha256: source.requestSha256 }, field: 'request', itemId: null, text: input.request }],
    evidence: [], payload: { kind: 'intake', textSha256: sha(input.request), chosenId: 'chosen' }, extra: 'advisory note' };
  const path = join(root, 'input.json'); writeFileSync(path, JSON.stringify(record));
  const writer = createTestProjectWriteAdapter(root, invocation);
  const published = await runJudgmentCommand(root, invocation, 'publish', path, writer);
  assert.ok('receipt' in published);
  assert.deepEqual(published.warnings, [{ code: 'UNKNOWN_FIELD', field: 'judgment.extra' }]);
  const checked = await runJudgmentCommand(root, invocation, 'check', published.receipt.path);
  assert.ok(checked.judgment);
  assert.equal(checked.judgment.decision, 'resolved');
  writeFileSync(path, JSON.stringify({ ...record, quotes: [{ ...record.quotes[0], text: 'fabricated excerpt' }] }));
  await assert.rejects(runJudgmentCommand(root, invocation, 'publish', path, writer), /AI_JUDGMENT_QUOTE_MISMATCH/);
  capturePiRequest(root, 'new user request');
  await assert.rejects(runJudgmentCommand(root, invocation, 'check', published.receipt.path), /AI_JUDGMENT_CONTEXT_MISMATCH/);
});
