import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { MAX_INLINE_EVIDENCE_BYTES } from '../core/runtime/evidence-proxy.ts';
import { getNativePiRun } from '../core/runtime/native-pi-run.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { validateCurrentProjectRun } from '../core/runtime/invocation.ts';
import { MAKER_EFFORT, MAKER_TASK, MAKER_SYSTEM, parseMakerHandback } from './pi-maker-contract.ts';
import { requirePreparedMaker, type PreparedNativeMaker } from '../core/runtime/native-maker-packet.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { requirePiStudyExecutable } from './pi-study-contract.ts';
import { createReviewerMcpAdapter } from './reviewer-mcp.ts';
import { PiReviewerRpc } from './pi-reviewer-rpc.ts';
import { observeSourceStudyUsage } from './pi-study-usage.ts';
import {
  PI_REVIEWER_BRIDGE_SCHEMA,
  PI_REVIEWER_TOOL,
  PiReviewerError,
  piDigest,
  piHash,
  piParse,
  piRecord,
  piText,
  type PiReviewerHostContext,
} from './pi-reviewer-contract.ts';

export type PiMakerInput = Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  prepared: PreparedNativeMaker;
  signal?: AbortSignal;
}>;

const bridgePath = realpathSync(fileURLToPath(new URL('../extensions/omd-reviewer-evidence.ts', import.meta.url)));
const MAX_MAKER_FINAL_BYTES = 6 * 1024 * 1024;
const results = new WeakSet<object>();
export function requirePiMakerResult(result: PiMakerResult): void {
  if (!results.has(result)) throw new PiReviewerError('maker-result-authority');
}
export type PiMakerResult = Awaited<ReturnType<typeof runPiMaker>>;

function childEnvironment(configPath: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('OMD_') && key !== 'NODE_OPTIONS' && key !== 'NODE_TEST_CONTEXT') environment[key] = value;
  }
  environment.OMD_PI_REVIEWER_BRIDGE_PATH = configPath;
  return environment;
}

function requireState(response: Record<string, unknown>, host: PiReviewerHostContext,
  expected: Readonly<{ sessionId?: string; initialMessageCount?: number }>): Record<string, unknown> {
  const value = piRecord(response.data, 'maker-state');
  const model = piRecord(value.model, 'maker-state-model');
  if (model.provider !== host.provider || model.id !== host.model || value.thinkingLevel !== host.thinkingLevel
    || value.isStreaming !== false || value.isCompacting !== false || value.pendingMessageCount !== 0
    || (expected.sessionId === undefined ? value.messageCount !== expected.initialMessageCount : value.sessionId !== expected.sessionId)) {
    throw new PiReviewerError('maker-state-model-session-or-history');
  }
  return value;
}

function finalMessage(response: Record<string, unknown>, host: PiReviewerHostContext): string {
  const data = piRecord(response.data, 'maker-messages');
  if (!Array.isArray(data.messages) || data.messages.length < 3) throw new PiReviewerError('maker-messages-empty');
  const last = piRecord(data.messages.at(-1), 'maker-final-message');
  if (last.role !== 'assistant' || last.stopReason !== 'stop' || last.errorMessage !== undefined
    || last.provider !== host.provider || last.model !== host.model || !Array.isArray(last.content)) {
    throw new PiReviewerError('maker-assistant-failed');
  }
  const text = last.content.map(value => {
    const part = piRecord(value, 'maker-final-content');
    if (part.type === 'text') return piText(part.text, 'maker-final-text');
    if (part.type === 'thinking') return '';
    throw new PiReviewerError('maker-final-content-type');
  }).join('');
  if (Buffer.byteLength(text) > MAX_MAKER_FINAL_BYTES) throw new PiReviewerError('maker-final-too-large');
  piRecord(piParse(text, 'maker-final-json'), 'maker-final-handback');
  return text;
}

export async function runPiMaker(input: PiMakerInput) {
  const startedAt = performance.now();
  if (input.signal?.aborted) throw new PiReviewerError('cancelled');
  validateCurrentProjectRun(input.invocation);
  const run = getNativePiRun(input.invocation, input.root);
  requirePiStudyExecutable(run.host);
  const prepared = requirePreparedMaker(input.prepared, input.root, input.invocation);
  const packetBytes = prepared.packet;
  if (packetBytes.byteLength > MAX_INLINE_EVIDENCE_BYTES) throw new PiReviewerError('maker-packet-too-large');
  const host: PiReviewerHostContext = Object.freeze({ ...run.host, thinkingLevel: MAKER_EFFORT });
  const packetSha256 = piHash(packetBytes);
  const bridgeSha256 = piHash(readFileSync(bridgePath));
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omd-pi-maker-')));
  const systemPath = join(directory, 'system.txt');
  const configPath = join(directory, 'bridge.json');
  const args = [
    host.cliPath, '--mode', 'rpc', '--no-session', '--provider', host.provider, '--model', host.model,
    '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
    '--no-approve', '--no-tools', '--system-prompt', systemPath, '--append-system-prompt', '',
    '-e', bridgePath, '--tools', PI_REVIEWER_TOOL,
  ];
  const adapter = createReviewerMcpAdapter();
  let rpc: PiReviewerRpc | undefined;
  try {
    writeFileSync(systemPath, MAKER_SYSTEM, { mode: 0o600, flag: 'wx' });
    rpc = new PiReviewerRpc({
      command: host.nodePath,
      args,
      cwd: directory,
      env: childEnvironment(configPath),
      processGroup: true,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    const processPid = rpc.child.pid;
    if (processPid === undefined) throw new PiReviewerError('maker-child-pid');
    await rpc.request({ type: 'set_thinking_level', level: MAKER_EFFORT, scope: 'turn' });
    const initialResponse = piRecord((await rpc.request({ type: 'get_messages' })).data, 'maker-initial-messages');
    if (!Array.isArray(initialResponse.messages) || initialResponse.messages.length > 1) {
      throw new PiReviewerError('maker-initial-conversation-history');
    }
    for (const value of initialResponse.messages) {
      const message = piRecord(value, 'maker-initial-message');
      if (Object.keys(message).sort().join() !== 'content,effort,role,timestamp'
        || message.role !== 'configurationUpdate' || message.effort !== MAKER_EFFORT
        || !Array.isArray(message.content) || message.content.length !== 0
        || typeof message.timestamp !== 'number' || !Number.isFinite(message.timestamp) || message.timestamp < 0) {
        throw new PiReviewerError('maker-initial-conversation-history');
      }
    }
    const initial = requireState(await rpc.request({ type: 'get_state' }), host, { initialMessageCount: initialResponse.messages.length });
    const sessionId = piText(initial.sessionId, 'maker-session');
    if (sessionId === host.parentSessionId) throw new PiReviewerError('maker-parent-session-reused');
    const ready = await rpc.waitEvent('omd_reviewer_ready', 30_000);
    if (ready.sessionId !== sessionId || ready.provider !== host.provider || ready.model !== host.model
      || ready.thinkingLevel !== MAKER_EFFORT || ready.modelMessageCount !== 0
      || !Array.isArray(ready.tools) || ready.tools.join(',') !== PI_REVIEWER_TOOL) {
      throw new PiReviewerError('maker-child-isolation');
    }
    const systemPromptSha256 = piDigest(ready.systemPromptSha256, 'maker-system-prompt');
    const directoryPrompt = `${MAKER_SYSTEM}\nCurrent working directory: ${directory.replaceAll('\\', '/')}\n`;
    if (systemPromptSha256 !== piHash(MAKER_SYSTEM) && systemPromptSha256 !== piHash(directoryPrompt)) {
      throw new PiReviewerError('maker-ambient-system-prompt');
    }
    const roleNonce = randomUUID();
    const processBinding = {
      parentPid: process.pid,
      parentExecutableSha256: piHash(readFileSync(process.execPath)),
      reviewerPid: processPid,
      reviewerExecutableSha256: host.nodeSha256,
      laneId: prepared.input.role,
      runnerId: randomUUID(),
      sessionId,
      nonce: roleNonce,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const launchReceipt = adapter.launchDelegated({
      host: 'pi',
      ...input.invocation.current,
      browserSha256: prepared.bindings.evidenceSha256,
      evidence: packetBytes,
      processBinding,
    });
    const bundle = adapter.launchBundle({
      reviewerLaunchReceipt: launchReceipt,
      loadedSkillReceipt: adapter.observeDelegatedReviewer('pi', { loadedSkillSha256: run.loadedSkillSha256 },
        run.loadedSkillSha256, processPid, host.nodeSha256),
    });
    const proxy = bundle.configuration.mcpServers['omd-reviewer-evidence'];
    writeFileSync(configPath, JSON.stringify({
      schema: PI_REVIEWER_BRIDGE_SCHEMA,
      nodePath: proxy.command,
      args: proxy.args,
      configurationSha256: launchReceipt.configurationSha256,
      packetSha256,
      sessionId,
      provider: host.provider,
      model: host.model,
      thinkingLevel: MAKER_EFFORT,
    }), { mode: 0o600, flag: 'wx' });
    await Promise.all([rpc.waitEvent('agent_settled'),
      rpc.request({ type: 'prompt', message: MAKER_TASK })]);
    requireState(await rpc.request({ type: 'get_state' }), host, { sessionId });
    const messages = await rpc.request({ type: 'get_messages' });
    const final = finalMessage(messages, host);
    const entries = piRecord((await rpc.request({ type: 'get_entries' })).data, 'maker-entries');
    if (!Array.isArray(entries.entries) || entries.entries.length === 0) throw new PiReviewerError('maker-session-entries');
    const failure = rpc.events.find(event => ['extension_error', 'compaction_start', 'auto_compaction_start'].includes(String(event.type)));
    if (failure !== undefined) throw new PiReviewerError('maker-child-context-or-extension-failure', failure);
    const tools = rpc.events.filter(event => event.type === 'tool_execution_end');
    if (tools.length !== 1 || tools[0]?.toolName !== PI_REVIEWER_TOOL || tools[0]?.isError !== false) {
      throw new PiReviewerError('maker-evidence-tool-execution');
    }
    const details = piRecord(piRecord(tools[0].result, 'maker-tool-result').details, 'maker-tool-result-details');
    if (details.packetSha256 !== packetSha256) throw new PiReviewerError('maker-tool-result-packet');
    if (!rpc.events.some(event => event.type === 'omd_reviewer_provider_request'
      && typeof event.imageCount === 'number' && event.imageCount >= prepared.imageCount)) {
      throw new PiReviewerError('maker-images-not-delivered');
    }
    const proof = adapter.consumeCompletedLaunchBundle(bundle, 'pi', {
      buildSha256: run.buildSha256,
      briefSha256: run.briefSha256,
      browserSha256: prepared.bindings.evidenceSha256,
    });
    if (proof.evidenceSha256 !== packetSha256 || proof.sessionId !== sessionId || proof.nonce !== roleNonce
      || proof.childPid === processPid) throw new PiReviewerError('maker-consumed-packet-mismatch');
    const handback = parseMakerHandback(piParse(final, 'maker-final-json'), {
      bindings: prepared.bindings, paths: prepared.input.paths, referenceImages: prepared.referenceImages,
    });
    await rpc.finish();
    getNativePiRun(input.invocation, input.root);
    const taskSha256 = piHash(MAKER_TASK);
    const configurationSha256 = piHash(canonicalJson({
      host, role: prepared.input.role, system: MAKER_SYSTEM, bridgeSha256, tool: PI_REVIEWER_TOOL,
      taskSha256, roleNonce, fixedBindings: prepared.bindings,
    }));
    const receipt = Object.freeze({
      schema: 'native-pi-maker-execution-v1', role: prepared.input.role,
      modelReasoningEffort: MAKER_EFFORT, modelSelection: 'inherited-pi-host',
      projectRoot: run.projectRoot,
      eventCount: rpc.eventCount,
      runtimeDurationMs: Math.round(performance.now() - startedAt),
      usage: observeSourceStudyUsage(messages),
      finalMessage: final,
      processPid,
      roleNonce,
      sessionId,
      parentSessionId: host.parentSessionId,
      taskSha256,
      configurationSha256,
      fixedBindings: prepared.bindings,
      provider: host.provider,
      model: host.model,
      nodeSha256: host.nodeSha256,
      cliSha256: host.cliSha256,
      bridgeSha256,
      systemPromptSha256,
      transcriptSha256: rpc.transcriptSha256,
      packetSha256,
      childPid: proof.childPid,
      evidenceSessionId: proof.sessionId,
      evidenceNonce: proof.nonce,
    });
    const result = Object.freeze({ handback, receipt, signature: signNativeObservation(input.root,
      'native-pi-maker-execution-v1', piHash(canonicalJson(receipt))) });
    results.add(result);
    return result;
  } finally {
    await rpc?.dispose();
    adapter.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
}

