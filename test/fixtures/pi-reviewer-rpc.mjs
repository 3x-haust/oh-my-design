import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const mode = process.env.PI_REVIEWER_FIXTURE_MODE ?? 'success';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const provider = option('--provider');
const model = option('--model');
const thinkingLevel = option('--thinking');
const sessionId = randomUUID();
const messages = [];
let ready = false;
let settled = false;
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const trace = event => {
  if (process.env.PI_REVIEWER_FIXTURE_TRACE) {
    appendFileSync(process.env.PI_REVIEWER_FIXTURE_TRACE, `${JSON.stringify({ event, pid: process.pid, sessionId })}\n`);
  }
};
const response = (request, data) => emit({ type: 'response', id: request.id, command: request.type, success: true, data });
const systemPrompt = `${readFileSync(option('--system-prompt'), 'utf8')}\nCurrent working directory: ${process.cwd()}\n`;
const sha256 = value => createHash('sha256').update(value).digest('hex');

for (const flag of ['--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-approve', '--no-tools']) {
  if (!args.includes(flag)) throw new Error(`Reviewer isolation flag missing: ${flag}`);
}
if (option('--mode') !== 'rpc' || option('--append-system-prompt') !== '') throw new Error('Reviewer prompt isolation is incomplete');

function emitReady() {
  if (ready) return;
  ready = true;
  if (mode === 'no-ready') {
    trace('ready-omitted');
    process.stdout.write('', () => process.exit(0));
    return;
  }
  trace('ready');
  emit({
    type: 'omd_reviewer_ready', sessionId, provider, model, thinkingLevel,
    tools: mode === 'extra-tool' ? ['read_reviewer_evidence', 'bash'] : ['read_reviewer_evidence'],
    systemPromptSha256: sha256(mode === 'ambient-system' ? `${systemPrompt}\nAmbient project guidance` : systemPrompt),
    modelMessageCount: mode === 'prehistory' ? 1 : 0,
  });
}

function handback(packet) {
  const contract = packet.outputContract;
  const observations = (packet.evidence?.observationProjection ?? packet.observationProjection)?.observations ?? [];
  return {
    schema: contract.schema,
    lane: contract.lane,
    verdicts: Object.fromEntries(contract.verdictKeys.map((key, index) => [key, mode === 'red-verdict' && index === 0 ? 'RED' : 'GREEN'])),
    criticalFloors: Object.fromEntries(contract.criticalFloorKeys.map(key => [key, 4])),
    ...(contract.designQuality === undefined ? {} : { designQuality: {
      schema: contract.designQuality.schema,
      axes: contract.designQuality.axes.map(axis => ({
        axis, verdict: 'GREEN', score: 4, crossViewport: 'preserved', criticalFailure: null,
        evidence: observations.map(observation => ({
          observationSha256: observation.observationSha256,
          viewport: observation.viewport, state: observation.state,
          region: 'Fixture screenshot', visibleCondition: 'Offline transport fixture evidence.',
          userConsequence: 'The fixture verifies evidence transport only.',
        })),
      })),
    } }),
    ...contract.fixedBindings,
    findings: [],
  };
}

async function prompt(request) {
  trace('prompt');
  response(request);
  messages.push({ role: 'user', content: [{ type: 'text', text: request.message }], timestamp: Date.now() });
  emit({ type: 'agent_start' });
  trace('active');
  if (mode === 'hang') return;
  let finalValue = { schema: 'adaptive-final-render-reviewer-handback-v1', lane: 'blindLane' };
  if (mode !== 'no-evidence') {
    const bridgePath = process.env.OMD_PI_REVIEWER_BRIDGE_PATH;
    if (!bridgePath) throw new Error('Private reviewer bridge configuration is missing');
    const config = JSON.parse(readFileSync(bridgePath, 'utf8'));
    if (config.sessionId !== sessionId || config.provider !== provider || config.model !== model) {
      throw new Error('Private reviewer bridge configuration is not bound to this child');
    }
    const { consumePiReviewerEvidence } = await import(pathToFileURL(option('-e')).href);
    const toolCallId = randomUUID();
    const toolCall = { role: 'assistant', content: [{ type: 'toolCall', id: toolCallId, name: 'read_reviewer_evidence', arguments: {} }], stopReason: 'toolUse' };
    messages.push(toolCall);
    emit({ type: 'message_end', message: toolCall });
    emit({ type: 'tool_execution_start', toolCallId, toolName: 'read_reviewer_evidence', args: {} });
    const result = await consumePiReviewerEvidence(config);
    trace('evidence');
    emit({ type: 'tool_execution_end', toolCallId, toolName: 'read_reviewer_evidence', result, isError: false });
    const toolResult = { role: 'toolResult', toolCallId, toolName: 'read_reviewer_evidence', content: result.content, isError: false, timestamp: Date.now() };
    messages.push(toolResult);
    emit({ type: 'message_end', message: toolResult });
    const text = result.content.find(item => item.type === 'text');
    if (!text) throw new Error('Evidence bridge supplied no packet text');
    finalValue = handback(JSON.parse(text.text));
    emit({ type: 'omd_reviewer_provider_request', imageCount: mode === 'images-blocked' ? 0 : result.content.filter(item => item.type === 'image').length });
    if (mode === 'extension-error') emit({ type: 'extension_error', error: 'Offline fixture extension failure' });
    if (mode === 'auto-compaction') emit({ type: 'compaction_start', reason: 'threshold' });
    if (mode === 'unauthorized-tool') emit({ type: 'tool_execution_end', toolCallId: randomUUID(), toolName: 'bash', result: { content: [] }, isError: false });
  } else {
    trace('evidence-skipped');
    messages.push({ role: 'assistant', provider, model, stopReason: 'stop', content: [{ type: 'text', text: 'The offline fixture skipped evidence.' }] });
  }
  const finalMessage = {
    role: 'assistant', content: [{ type: 'text', text: JSON.stringify(finalValue) }],
    provider, model, stopReason: mode === 'failed-final' ? 'error' : 'stop',
    ...(mode === 'failed-final' ? { errorMessage: 'Offline fixture provider failure' } : {}),
  };
  messages.push(finalMessage);
  trace('final');
  emit({ type: 'message_end', message: finalMessage });
  emit({ type: 'agent_end', messages });
  if (mode === 'no-settled') {
    trace('unsettled');
    return;
  }
  settled = true;
  trace('settled');
  emit({ type: 'agent_settled' });
}

async function handle(request) {
  switch (request.type) {
    case 'get_state':
      trace('state');
      response(request, {
        sessionId: mode === 'session-changed' && settled ? randomUUID() : sessionId,
        model: { provider, id: mode === 'wrong-model' ? 'unrequested-model' : model }, thinkingLevel,
        isStreaming: false, isCompacting: false, pendingMessageCount: 0,
        messageCount: mode === 'prehistory' ? 1 : messages.length,
      });
      emitReady();
      return;
    case 'get_commands': response(request, { commands: [] }); return;
    case 'get_messages': response(request, { messages }); return;
    case 'get_entries':
      response(request, {
        entries: messages.map((message, index) => ({
          type: 'message', id: String(index), parentId: index === 0 ? null : String(index - 1),
          timestamp: new Date(message.timestamp ?? 0).toISOString(), message,
        })),
        leafId: messages.length === 0 ? null : String(messages.length - 1),
      });
      return;
    case 'prompt': await prompt(request); return;
    case 'abort': response(request); return;
    default: emit({ type: 'response', id: request.id, command: request.type, success: false, error: `Unsupported fixture RPC command: ${request.type}` });
  }
}

trace('started');
const input = createInterface({ input: process.stdin });
for await (const line of input) {
  try { await handle(JSON.parse(line)); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
    input.close();
    break;
  }
}
