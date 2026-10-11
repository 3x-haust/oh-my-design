import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const mode = process.env.PI_STUDY_FIXTURE_MODE ?? 'success';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const provider = option('--provider');
const model = option('--model');
const parentThinkingLevel = 'high';
let thinkingLevel = parentThinkingLevel;
let configured = false;
let ready = false;
let settled = false;
const sessionId = randomUUID();
const messages = [];
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const response = (request, data) => emit({ type: 'response', id: request.id, command: request.type, success: true, data });
const trace = event => {
  if (process.env.PI_STUDY_FIXTURE_TRACE) {
    appendFileSync(process.env.PI_STUDY_FIXTURE_TRACE, `${JSON.stringify({ event, pid: process.pid, sessionId })}\n`);
  }
};
const systemPrompt = readFileSync(option('--system-prompt'), 'utf8');
const directoryPrompt = `${systemPrompt}\nCurrent working directory: ${process.cwd().replaceAll('\\', '/')}\n`;
const sha256 = value => createHash('sha256').update(value).digest('hex');

for (const flag of ['--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates',
  '--no-themes', '--no-context-files', '--no-approve', '--no-tools']) {
  if (!args.includes(flag)) throw new Error(`Study isolation flag missing: ${flag}`);
}
if (option('--mode') !== 'rpc' || option('--append-system-prompt') !== ''
  || args.filter(value => value === '--tools').length !== 1
  || option('--tools') !== 'read_reviewer_evidence') {
  throw new Error('Study prompt or tool isolation is incomplete');
}

function emitReady() {
  if (ready) return;
  ready = true;
  trace('ready');
  emit({
    type: 'omd_reviewer_ready',
    sessionId,
    provider,
    model,
    thinkingLevel,
    tools: mode === 'extra-tool' ? ['read_reviewer_evidence', 'bash'] : ['read_reviewer_evidence'],
    systemPromptSha256: sha256(mode === 'ambient-system' ? `${directoryPrompt}Ambient project context` : directoryPrompt),
    modelMessageCount: mode === 'prehistory' ? 1 : 0,
  });
}

function handback(packet) {
  const bindings = packet.outputContract.fixedBindings;
  if (packet.schema === 'native-maker-transport-v1') {
    const files = packet.evidence.allowedPaths.map(path => ({ path,
      content: path.endsWith('.html') ? '<!doctype html><html><body><main>maker-fixture<button>Continue</button></main></body></html>'
        : path.endsWith('.json') ? '{}' : `// maker-fixture ${path}\n` }));
    if (mode === 'extra-file') files.push({ path: 'outside.ts', content: 'unauthorized' });
    return { schema: packet.outputContract.schema, fixedBindings: bindings, files };
  }
  const content = mode === 'oversized-handback'
    ? `<main>${'x'.repeat(512 * 1024)}</main>`
    : '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;margin:0}main{min-height:100vh;display:grid;place-items:center}</style></head><body><main><button>Continue</button></main></body></html>';
  return {
    schema: packet.outputContract.schema,
    fixedBindings: bindings,
    files: mode === 'extra-file'
      ? [{ path: 'index.html', content }, { path: 'extra.css', content: 'body{}' }]
      : [{ path: 'index.html', content }],
    workState: { triggerSelector: null, readySelector: mode === 'missing-work' ? '#missing' : 'button' },
    relationship: 'The primary action anchors the supplied content hierarchy.',
    unresolvedConstraints: [],
  };
}

async function prompt(request) {
  const { SOURCE_STUDY_TASK } = await import(new URL('../../adapters/pi-study-contract.ts', import.meta.url));
  const { MAKER_TASK } = await import(new URL('../../adapters/pi-maker-contract.ts', import.meta.url));
  if (![SOURCE_STUDY_TASK, MAKER_TASK].includes(request.message)) throw new Error('Author task is not source-owned');
  trace('prompt');
  response(request);
  messages.push({ role: 'user', content: [{ type: 'text', text: request.message }], timestamp: Date.now() });
  emit({ type: 'agent_start' });
  trace('active');
  if (mode === 'hang') {
    if (!process.env.PI_STUDY_FIXTURE_ACTIVE_URL) throw new Error('Active-state subscriber missing');
    await fetch(`${process.env.PI_STUDY_FIXTURE_ACTIVE_URL}?pid=${process.pid}`);
    return;
  }
  const bridgePath = process.env.OMD_PI_REVIEWER_BRIDGE_PATH;
  if (!bridgePath) throw new Error('Private study bridge configuration is missing');
  const config = JSON.parse(readFileSync(bridgePath, 'utf8'));
  if (mode === 'evidence-drift') config.packetSha256 = '0'.repeat(64);
  const bridge = await import(pathToFileURL(option('-e')).href);
  const { consumePiReviewerEvidence } = bridge;
  const toolCallId = randomUUID();
  const toolCall = {
    role: 'assistant',
    ...(mode === 'missing-usage' ? {} : { usage: { input: 10, output: 2, cacheRead: 20, cacheWrite: 0, totalTokens: 32 } }),
    content: [{ type: 'toolCall', id: toolCallId, name: 'read_reviewer_evidence', arguments: {} }],
    stopReason: 'toolUse',
  };
  messages.push(toolCall);
  emit({ type: 'message_end', message: toolCall });
  emit({ type: 'tool_execution_start', toolCallId, toolName: 'read_reviewer_evidence', args: {} });
  const projected = mode === 'provider-projection'
    ? await (await import('./projected-reviewer-evidence.mjs')).projectedReviewerEvidence(bridge, config, sessionId, systemPrompt)
    : undefined;
  const result = projected?.result ?? await consumePiReviewerEvidence(config);
  trace('evidence');
  emit({ type: 'tool_execution_end', toolCallId, toolName: 'read_reviewer_evidence', result, isError: false });
  messages.push({
    role: 'toolResult',
    toolCallId,
    toolName: 'read_reviewer_evidence',
    content: result.content,
    isError: false,
    timestamp: Date.now(),
  });
  const packetText = result.content.find(item => item.type === 'text');
  if (!packetText) throw new Error('Study evidence supplied no packet text');
  const packet = JSON.parse(projected?.packetText ?? packetText.text);
  if (packet.schema === 'native-maker-transport-v1') {
    const delivered = JSON.stringify([packet, ...result.content]);
    for (const forbidden of ['AMBIENT_PROJECT_SENTINEL', 'RAW_PRODUCTION_BRIEF_SENTINEL', 'PRIVATE_VERDICT_SENTINEL',
      'quarantined.example', 'PRIVATE_RESEARCH_SENTINEL']) {
      if (delivered.includes(forbidden)) throw new Error(`Maker context leaked ${forbidden}`);
    }
    if (packet.evidence.context.taskOutcome.mustHave.length === 0) throw new Error('Maker task was narrowed');
    const deliveredImages = result.content.filter(item => item.type === 'image');
    if (deliveredImages.length !== packet.evidence.renders.length
      || deliveredImages.some((image, index) => sha256(Buffer.from(image.data, 'base64'))
        !== packet.evidence.renders[index].captureSha256)) {
      throw new Error('Incomplete maker image delivery');
    }
    if (mode === 'maker-images') {
      if (deliveredImages.length !== 6 || deliveredImages.some((image, index) => sha256(Buffer.from(image.data, 'base64'))
        !== packet.evidence.renders[index].captureSha256)) throw new Error('Incomplete first-party image delivery');
    }
  }
  emit({
    type: 'omd_reviewer_provider_request',
    imageCount: mode === 'missing-image' ? 0 : result.content.filter(item => item.type === 'image').length,
  });
  if (mode === 'maker-extension-error') emit({
    type: 'extension_error', event: 'before_provider_request', error: 'fixture-evidence-drift',
  });
  const finalText = mode === 'malformed-handback' ? '{' : JSON.stringify(handback(packet));
  const finalMessage = {
    role: 'assistant',
    usage: { input: 5, output: 15, cacheRead: 30, cacheWrite: 0, totalTokens: 50 },
    content: [{ type: 'text', text: finalText }],
    provider,
    model,
    stopReason: 'stop',
  };
  messages.push(finalMessage);
  trace('final');
  emit({ type: 'message_end', message: finalMessage });
  emit({ type: 'agent_end', messages });
  settled = true;
  trace('settled');
  emit({ type: 'agent_settled' });
}

async function handle(request) {
  switch (request.type) {
    case 'set_thinking_level':
      if (request.level !== 'medium' || request.scope !== 'turn' || messages.length !== 0) {
        throw new Error('Study effort must be medium and turn-scoped');
      }
      thinkingLevel = mode === 'thinking-drift' ? parentThinkingLevel : request.level;
      if (mode === 'configuration-update') {
        messages.push({ role: 'configurationUpdate', content: [], effort: request.level, timestamp: Date.now() });
      }
      configured = true;
      response(request);
      return;
    case 'get_state':
      response(request, {
        sessionId,
        model: { provider, id: mode === 'wrong-model' ? 'unrequested-model' : model },
        thinkingLevel,
        isStreaming: false,
        isCompacting: false,
        pendingMessageCount: 0,
        messageCount: mode === 'prehistory' ? 1 : messages.length,
      });
      emitReady();
      return;
    case 'get_messages':
      response(request, { messages });
      return;
    case 'get_entries':
      response(request, {
        entries: messages.map((message, index) => ({
          type: 'message',
          id: String(index),
          parentId: index === 0 ? null : String(index - 1),
          timestamp: new Date(message.timestamp ?? 0).toISOString(),
          message,
        })),
        leafId: messages.length === 0 ? null : String(messages.length - 1),
      });
      return;
    case 'prompt':
      if (!configured || thinkingLevel !== 'medium') throw new Error('Study effort was not configured');
      await prompt(request);
      return;
    default:
      emit({ type: 'response', id: request.id, command: request.type, success: false, error: 'Unsupported fixture command' });
  }
}

trace('started');
const input = createInterface({ input: process.stdin });
for await (const line of input) {
  try {
    await handle(JSON.parse(line));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
    input.close();
    break;
  }
}
