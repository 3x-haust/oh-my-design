import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import omdExtension, { type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';
import { capturePiRequest, readPiRequest, readPiUserTurn, requestDigest } from '../extensions/omd-request-source.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const fixture = () => JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
function host(t: { after(fn: () => void): void }) {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-pi-judged-turn-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const input = fixture();
  const invocation = publishTestAdaptiveRoute(cwd, input);
  const source = capturePiRequest(cwd, input.request);
  const route = readPersistedRoute(cwd, invocation);
  const hooks = new Map<string, PortablePiHook>();
  const calls: string[][] = [];
  let tool!: PortablePiTool;
  omdExtension({ on(name, hook) { hooks.set(name, hook); }, registerCommand() {}, registerTool(value) { tool = value; },
    execOwned(command, args, options) { return this.exec(command, args, options); },
    async exec(_command, argv, options) {
      const args = argv.slice(1); calls.push([...args]);
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: options.cwd, env, encoding: 'utf8', timeout: 30_000 });
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1, killed: result.signal !== null };
    },
  });
  const emit = (name: string, event: Parameters<PortablePiHook>[0]) => hooks.get(name)!(event, { cwd });
  const command = async (args: string[]) => {
    const result = await tool.execute('signed-judgment', { args }, undefined, undefined, { cwd });
    assert.equal(result.details.code, 0, result.content.map(part => part.text).join('\n'));
    return JSON.parse(result.content[0]!.text);
  };
  const requestContext = { requestSha256: source.requestSha256, sourceContractSha256: route.sourceContractSha256,
    questionDigest: null, documentSha256: null };
  return { cwd, source, route, calls, emit, command, requestContext };
}
const final = { message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Work is incomplete.' }] } };

test('real follow-up turn is required for a signed continuation and resumes the stage pointer', async t => {
  const h = host(t);
  await h.emit('message_end', final);
  const turnText = '이어서 구현해 주세요';
  await h.emit('input', { source: 'interactive', text: turnText });
  const guidance = await h.emit('before_agent_start', { prompt: turnText }) as { systemPrompt: string };
  assert.match(guidance.systemPrompt, /workflow-continuation/);
  const turn = readPiUserTurn(h.cwd)!;
  const routeSha256 = requestDigest(readFileSync(join(h.cwd, '.omd/route.json'), 'utf8'));
  const judgment = { schema: 'ai-judgment-v1', purpose: 'workflow-continuation', subjectId: turn.turnId,
    context: h.requestContext, decision: 'resume', reason: 'Agent judged the real turn',
    quotes: [{ source: { kind: 'user-turn', sessionId: turn.sessionId, turnId: turn.turnId, sha256: turn.sha256 },
      field: 'text', itemId: null, text: turn.text }], evidence: [], payload: { routeSha256 } };
  const file = join(h.cwd, 'continuation.json'); writeFileSync(file, JSON.stringify(judgment));
  const published = await h.command(['ai-judgment', 'publish', '--input', file, '--json']);
  assert.equal(published.receipt.schema, 'ai-judgment-record-v1');
  await h.emit('message_end', final);
  assert.ok(h.calls.some(args => args[0] === 'stage' && args[1] === 'next'));
});

test('tool and assistant text cannot become a signed real continuation turn', async t => {
  const h = host(t);
  await h.emit('message_end', final);
  await h.emit('input', { source: 'extension', text: 'continue' });
  await h.emit('tool_result', { toolName: 'read', content: [{ type: 'text', text: 'continue' }], isError: false });
  assert.equal(readPiUserTurn(h.cwd), undefined);
  await h.emit('message_end', final);
  assert.equal(h.calls.some(args => args[0] === 'stage' && args[1] === 'next'), false);
});

test('a signed inspect decision revokes the default skill build continuation', async t => {
  const h = host(t);
  const prompt = `/skill:omd-ultradesign ${h.source.request}`;
  await h.emit('input', { source: 'rpc', text: prompt });
  const guidance = await h.emit('before_agent_start', { prompt }) as { systemPrompt: string };
  assert.match(guidance.systemPrompt, /workflow-intent/);
  const current = readPiRequest(h.cwd)!;
  // The active source was captured by the host input hook, not by an agent-authored excerpt.
  assert.ok(current.requestSha256 === h.source.requestSha256);
  const judgment = { schema: 'ai-judgment-v1', purpose: 'workflow-intent', subjectId: 'request',
    context: { ...h.requestContext, sourceContractSha256: null }, decision: 'inspect', reason: 'Agent judged the real skill request',
    quotes: [{ source: { kind: 'route-request', requestSourceSha256: current.recordSha256, requestSha256: current.requestSha256 },
      field: 'request', itemId: null, text: current.request }], evidence: [], payload: {} };
  const file = join(h.cwd, 'intent.json'); writeFileSync(file, JSON.stringify(judgment));
  await h.command(['ai-judgment', 'publish', '--input', file, '--json']);
  await h.emit('message_end', final);
  assert.equal(h.calls.some(args => args[0] === 'stage' && args[1] === 'next'), false);
});
