// Offline reviewer transport fixture, not an aesthetic evaluator. It consumes every real image
// through the isolated production bridge and returns native inventory citations for gate tests.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const provider = option('--provider'), model = option('--model'), thinkingLevel = option('--thinking');
const sessionId = randomUUID(), messages = [];
let ready = false;
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const response = (request, data) => emit({ type: 'response', id: request.id, command: request.type, success: true, data });
const systemPrompt = `${readFileSync(option('--system-prompt'), 'utf8')}\nCurrent working directory: ${process.cwd()}\n`;
for (const flag of ['--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-approve', '--no-tools']) if (!args.includes(flag)) throw new Error(`Isolation flag missing: ${flag}`);
function handback(packet) {
  const output = packet.outputContract, measurements = packet.measurementProjection;
  if (output.designQuality?.schema !== 'design-quality-contract-v2' || !measurements?.length) throw new Error('Fixture requires actual measured evidence');
  return { schema: output.schema, lane: output.lane, ...output.fixedBindings,
    ...(packet.surfaceReviewContract ? { surfaceReview: { schema: 'surface-review-v1', rows: packet.surfaceReviewContract.rows.map(row => ({ ...row, criteria: Object.fromEntries(Object.keys(row.criteria).map(key => [key, 'pass'])) })) } } : {}),
    verdicts: Object.fromEntries(output.verdictKeys.map(key => [key, 'GREEN'])), criticalFloors: Object.fromEntries(output.criticalFloorKeys.map(key => [key, 4])), findings: [],
    designQuality: { schema: output.designQuality.schema, axes: output.designQuality.axes.map(axis => ({ axis, verdict: 'GREEN', score: 4, crossViewport: 'preserved', criticalFailure: null,
      evidence: packet.observationProjection.map(view => {
        const native = measurements.find(p => p.packetSha256 === view.packetSha256);
        const ids = native.measurements.filter(m => m.viewIds.includes(view.viewId) && output.designQuality.requiredMetricKinds[axis].includes(m.kind)).map(m => m.id);
        return { observationSha256: view.observationSha256, captureSha256: view.captureSha256, viewId: view.viewId, state: view.state, packetSha256: view.packetSha256,
          regionSubjectIds: [], measurementIds: ids, visibleCondition: 'Offline fixture consumed this native image and its inventories.', userConsequence: 'This fixture tests transport and deterministic acceptance, not aesthetic judgment.' };
      }) })) } };
}
async function handle(request) {
  if (request.type === 'get_state') {
    response(request, { sessionId, model: { provider, id: model }, thinkingLevel, isStreaming: false, isCompacting: false, pendingMessageCount: 0, messageCount: messages.length });
    if (!ready) { ready = true; emit({ type: 'omd_reviewer_ready', sessionId, provider, model, thinkingLevel, tools: ['read_reviewer_evidence'], modelMessageCount: 0,
      systemPromptSha256: createHash('sha256').update(systemPrompt).digest('hex') }); }
  } else if (request.type === 'get_messages') response(request, { messages });
  else if (request.type === 'get_entries') response(request, { entries: messages.map((message, i) => ({ type: 'message', id: String(i), parentId: i ? String(i - 1) : null, timestamp: new Date(0).toISOString(), message })), leafId: String(messages.length - 1) });
  else if (request.type === 'prompt') {
    response(request); messages.push({ role: 'user', content: [{ type: 'text', text: request.message }] }); emit({ type: 'agent_start' });
    const config = JSON.parse(readFileSync(process.env.OMD_PI_REVIEWER_BRIDGE_PATH, 'utf8'));
    if (config.sessionId !== sessionId || config.provider !== provider || config.model !== model) throw new Error('Bridge identity mismatch');
    const { consumePiReviewerEvidence } = await import(pathToFileURL(option('-e')).href);
    const toolCallId = randomUUID(), call = { role: 'assistant', content: [{ type: 'toolCall', id: toolCallId, name: 'read_reviewer_evidence', arguments: {} }], stopReason: 'toolUse' };
    messages.push(call); emit({ type: 'message_end', message: call }); emit({ type: 'tool_execution_start', toolCallId, toolName: 'read_reviewer_evidence', args: {} });
    const result = await consumePiReviewerEvidence(config);
    emit({ type: 'tool_execution_end', toolCallId, toolName: 'read_reviewer_evidence', result, isError: false });
    const toolResult = { role: 'toolResult', toolCallId, toolName: 'read_reviewer_evidence', content: result.content, isError: false };
    messages.push(toolResult); emit({ type: 'message_end', message: toolResult });
    emit({ type: 'omd_reviewer_provider_request', imageCount: result.content.filter(item => item.type === 'image').length });
    const packet = JSON.parse(result.content.find(item => item.type === 'text').text);
    const final = { role: 'assistant', provider, model, stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(handback(packet)) }] };
    messages.push(final); emit({ type: 'message_end', message: final }); emit({ type: 'agent_end', messages }); emit({ type: 'agent_settled' });
  } else if (request.type === 'abort') response(request);
  else throw new Error(`Unexpected fixture RPC request: ${request.type}`);
}
const input = createInterface({ input: process.stdin });
for await (const line of input) {
  try { await handle(JSON.parse(line)); }
  catch (error) { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; input.close(); break; }
}
