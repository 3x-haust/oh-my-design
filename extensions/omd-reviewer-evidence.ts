import { Type } from 'typebox';
import { readFileSync } from 'node:fs';
import { PiReviewerRpc } from '../adapters/pi-reviewer-rpc.ts';
import { PI_REVIEWER_EVENT_PREFIX, PI_REVIEWER_TOOL, PiReviewerError, parsePiEvidenceContent, parsePiReviewerBridge, piHash, piParse, piRecord, piText,
  type PiEvidenceContent, type PiReviewerBridge } from '../adapters/pi-reviewer-contract.ts';

type ReviewerContext = Readonly<{
  cwd: string; signal?: AbortSignal;
  model?: Readonly<{ provider: string; id: string }>; thinkingLevel?: string;
  sessionManager: Readonly<{ getSessionId(): string; getBranch(): readonly unknown[] }>;
  getSystemPrompt(): string;
}>;
type EvidenceResult = Readonly<{ content: PiEvidenceContent[]; details: Readonly<{ packetSha256: string }> }>;
type ReviewerApi = Readonly<{
  getActiveTools(): string[];
  on(event: string, handler: (event: Record<string, unknown>, context: ReviewerContext) => unknown): void;
  registerTool(tool: Readonly<{
    name: string; label: string; description: string; parameters: unknown;
    execute(id: string, params: unknown, signal: AbortSignal | undefined, update: unknown, context: ReviewerContext): Promise<EvidenceResult>;
  }>): void;
}>;

export async function consumePiReviewerEvidence(configInput: unknown, signal?: AbortSignal): Promise<EvidenceResult> {
  const config = parsePiReviewerBridge(configInput);
  const proxy = new PiReviewerRpc({ command: config.nodePath, args: config.args,
    cwd: process.cwd(), env: { PATH: process.env.PATH }, ...(signal === undefined ? {} : { signal }) });
  try {
    await proxy.request({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'omd-pi-reviewer', version: '1' } } });
    const response = await proxy.request({ jsonrpc: '2.0', method: 'tools/call', params: { name: PI_REVIEWER_TOOL, arguments: {} } });
    const result = piRecord(response.result, 'evidence-response');
    if (result.isError === true) throw new PiReviewerError('evidence-unavailable');
    const structured = piRecord(result.structuredContent, 'evidence-structure');
    if (structured.sha256 !== config.packetSha256) throw new PiReviewerError('evidence-packet-drift');
    let content: PiEvidenceContent[];
    if (typeof structured.base64 === 'string') {
      const bytes = Buffer.from(structured.base64, 'base64');
      if (piHash(bytes) !== config.packetSha256) throw new PiReviewerError('opaque-packet-drift');
      const packet = piRecord(piParse(bytes.toString('utf8'), 'opaque-packet-json'), 'opaque-packet');
      const evidence = piRecord(packet.evidence, 'opaque-evidence');
      content = [];
      const projected: Record<string, unknown> = { ...evidence };
      for (const field of ['renders', 'referenceRenders']) {
        const rows = evidence[field];
        if (rows === undefined) continue;
        if (!Array.isArray(rows)) throw new PiReviewerError('opaque-renders');
        projected[field] = rows.map(raw => {
          const render = piRecord(raw, 'opaque-render');
          const png = piText(render.pngBase64, 'opaque-image');
          const { pngBase64: _image, ...label } = render;
          content.push({ type: 'text', text: JSON.stringify(label) }, { type: 'image', data: png, mimeType: 'image/png' });
          return label;
        });
      }
      content.unshift({ type: 'text', text: JSON.stringify({ ...packet, evidence: projected }) });
    } else content = parsePiEvidenceContent(result.content);
    await proxy.finish();
    return { content, details: { packetSha256: config.packetSha256 } };
  } finally { await proxy.dispose(); }
}

function imageCount(value: unknown, visited = new Set<object>()): number {
  if (typeof value !== 'object' || value === null || visited.has(value)) return 0;
  visited.add(value);
  if (Array.isArray(value)) return value.reduce((count, item) => count + imageCount(item, visited), 0);
  const record = piRecord(value, 'provider-payload');
  if (record.type === 'input_image' || record.type === 'image' || record.type === 'image_url') return 1;
  const bedrockImage = record.image;
  if (typeof bedrockImage === 'object' && bedrockImage !== null && Reflect.has(bedrockImage, 'source')) return 1;
  const inline = record.inlineData;
  if (typeof inline === 'object' && inline !== null
    && String(Reflect.get(inline, 'mimeType')).startsWith('image/')) return 1;
  return Object.values(record).reduce<number>((count, item) => count + imageCount(item, visited), 0);
}
function readConfig(): PiReviewerBridge {
  const path = piText(process.env.OMD_PI_REVIEWER_BRIDGE_PATH, 'bridge-path');
  return parsePiReviewerBridge(piParse(readFileSync(path, 'utf8'), 'bridge-json'));
}
const emit = (value: object): void => { process.stderr.write(`${PI_REVIEWER_EVENT_PREFIX}${JSON.stringify(value)}\n`); };

export default function piReviewerEvidence(pi: ReviewerApi): void {
  let consumed = false;
  pi.registerTool({ name: PI_REVIEWER_TOOL, label: 'Reviewer evidence',
    description: 'Read the anonymous evidence and every supplied image exactly once before judging.',
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_id, params, signal, _update, context) {
      if (consumed || Object.keys(piRecord(params, 'tool-arguments')).length !== 0) throw new PiReviewerError('evidence-reused-or-arguments');
      const config = readConfig();
      if (context.sessionManager.getSessionId() !== config.sessionId
        || context.model?.provider !== config.provider || context.model.id !== config.model
        || context.thinkingLevel !== config.thinkingLevel) throw new PiReviewerError('child-model-or-session-drift');
      consumed = true;
      return consumePiReviewerEvidence(config, signal);
    },
  });
  pi.on('session_start', (_event, context) => {
    emit({ type: 'omd_reviewer_ready', sessionId: context.sessionManager.getSessionId(),
      provider: context.model?.provider, model: context.model?.id, thinkingLevel: context.thinkingLevel,
      tools: pi.getActiveTools(), systemPromptSha256: piHash(context.getSystemPrompt()),
      modelMessageCount: context.sessionManager.getBranch().filter(entry => typeof entry === 'object'
        && entry !== null && Reflect.get(entry, 'type') === 'message').length });
  });
  pi.on('before_agent_start', (_event, context) => {
    const config = readConfig();
    if (pi.getActiveTools().join(',') !== PI_REVIEWER_TOOL || context.sessionManager.getSessionId() !== config.sessionId
      || context.model?.provider !== config.provider || context.model.id !== config.model
      || context.thinkingLevel !== config.thinkingLevel) throw new PiReviewerError('child-boundary-drift');
  });
  pi.on('before_provider_request', event => {
    emit({ type: 'omd_reviewer_provider_request', imageCount: imageCount(event.payload) });
  });
}
