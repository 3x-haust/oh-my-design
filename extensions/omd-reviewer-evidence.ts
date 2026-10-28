import { Type } from 'typebox';
import { readFileSync } from 'node:fs';
import { PiReviewerRpc } from '../adapters/pi-reviewer-rpc.ts';
import { FIRST_RENDER_REVIEW_TRANSPORT } from '../core/design/first-render-review-contract.ts';
import { PI_REVIEWER_EVENT_PREFIX, PI_REVIEWER_TOOL, PiReviewerError, parsePiEvidenceContent, parsePiReviewerBridge, piHash, piParse, piRecord, piText,
  type PiEvidenceContent, type PiReviewerBridge } from '../adapters/pi-reviewer-contract.ts';

type ReviewerContext = Readonly<{
  cwd: string; signal?: AbortSignal;
  model?: Readonly<{ provider: string; id: string }>; thinkingLevel?: string;
  sessionManager: Readonly<{ getSessionId(): string; getBranch(): readonly unknown[] }>;
  getSystemPrompt(): string;
}>;
type EvidenceResult = Readonly<{ content: PiEvidenceContent[]; details: Readonly<{ packetSha256: string }> }>;
type ImageDimensions = Readonly<{ width: number; height: number }>;
type ProviderEvidence = Readonly<{
  packetSha256: string; text: string; textSha256: string; textBytes: number; imageCount: number;
  imageDimensions?: readonly (ImageDimensions | null)[];
}>;
type ReviewerApi = Readonly<{
  getActiveTools(): string[];
  on(event: string, handler: (event: Record<string, unknown>, context: ReviewerContext) => unknown): void;
  registerTool(tool: Readonly<{
    name: string; label: string; description: string; parameters: unknown;
    execute(id: string, params: unknown, signal: AbortSignal | undefined, update: unknown, context: ReviewerContext): Promise<EvidenceResult>;
  }>): void;
}>;

const PROVIDER_DELIVERY_SCHEMA = 'omd-reviewer-evidence-provider-delivery-v1';

function providerDeliveryMarker(evidence: ProviderEvidence): string {
  return JSON.stringify({ schema: PROVIDER_DELIVERY_SCHEMA, packetSha256: evidence.packetSha256,
    textSha256: evidence.textSha256, textBytes: evidence.textBytes, imageCount: evidence.imageCount,
    delivery: 'following-user-input' });
}

export function piReviewerProviderEvidence(result: EvidenceResult): ProviderEvidence {
  const texts = result.content.filter(item => item.type === 'text');
  if (texts.length === 0) throw new PiReviewerError('provider-evidence-text');
  const text = texts.map(item => item.text).join('\n');
  const images = result.content.filter(item => item.type === 'image');
  // Native reviewer producers supply PNG originals; unknown formats cannot authorize host hints.
  const imageDimensions = images.map(image => {
    const bytes = Buffer.from(image.data, 'base64');
    return image.mimeType === 'image/png' && bytes.length >= 24
      && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      && bytes.toString('ascii', 12, 16) === 'IHDR'
      ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : null;
  });
  return { packetSha256: result.details.packetSha256, text, textSha256: piHash(text),
    textBytes: Buffer.byteLength(text), imageCount: images.length, imageDimensions };
}

function canonicalResizeHint(text: unknown, original: ImageDimensions | null | undefined): boolean {
  if (typeof text !== 'string' || !original) return false;
  const match = /^\[Image: original (\d+)x(\d+), displayed at (\d+)x(\d+)\. Multiply coordinates by (\d+\.\d{2}) to map to original image\.\]$/.exec(text);
  if (!match) return false;
  const width = Number(match[3]), height = Number(match[4]);
  // Host downscales may repeatedly floor each axis by 0.75; accumulated rounding stays below four pixels.
  const roundingLimit = 4 * (original.width + original.height);
  if (Number(match[1]) !== original.width || Number(match[2]) !== original.height
    || width <= 0 || height <= 0 || width > original.width || height > original.height
    || Math.abs(original.height * width - original.width * height) >= roundingLimit) return false;
  return text === `[Image: original ${original.width}x${original.height}, displayed at ${width}x${height}. Multiply coordinates by ${(original.width / width).toFixed(2)} to map to original image.]`;
}

export function deliverPiReviewerProviderEvidence(payloadInput: unknown, evidence: ProviderEvidence): unknown {
  const payload = piRecord(payloadInput, 'provider-payload');
  if (!Array.isArray(payload.input)) throw new PiReviewerError('provider-payload-input');
  const input = payload.input.map(item => piRecord(item, 'provider-input'));
  const calls = input.filter(item => item.type === 'function_call' && item.name === PI_REVIEWER_TOOL);
  if (calls.length !== 1) throw new PiReviewerError('provider-evidence-call');
  const callId = piText(calls[0]?.call_id, 'provider-evidence-call-id');
  const indexes = input.flatMap((item, index) =>
    item.type === 'function_call_output' && item.call_id === callId ? [index] : []);
  const outputIndex = indexes[0];
  if (indexes.length !== 1 || outputIndex === undefined) throw new PiReviewerError('provider-evidence-output');
  const output = input[outputIndex];
  if (output === undefined) throw new PiReviewerError('provider-evidence-output');
  const marker = providerDeliveryMarker(evidence);
  let removedResizeHints = false;
  if (Array.isArray(output.output)) {
    const parts = output.output.map(item => piRecord(item, 'provider-output-part'));
    const first = parts[0];
    if (first?.type === 'input_text' && typeof first.text === 'string' && first.text.startsWith(`${marker}\n`)) {
      let nextImage = 0;
      for (const note of first.text.slice(marker.length + 1).split('\n')) {
        const matched = evidence.imageDimensions?.findIndex((dimensions, index) =>
          index >= nextImage && canonicalResizeHint(note, dimensions)) ?? -1;
        if (matched < 0) {
          throw new PiReviewerError('provider-evidence-drift', { reason: `unmatched host hint after image ${nextImage}: ${note.slice(0, 200)}; `
            + `known originals ${JSON.stringify(evidence.imageDimensions ?? [])}` });
        }
        nextImage = matched + 1;
      }
      first.text = marker;
      removedResizeHints = true;
    }
    let imageIndex = -1;
    output.output = parts.filter((part, index) => {
      if (part.type === 'input_image') imageIndex++;
      if (part.type === 'input_text' && parts[index - 1]?.type === 'input_image'
        && canonicalResizeHint(part.text, evidence.imageDimensions?.[imageIndex])) {
        removedResizeHints = true;
        return false;
      }
      return true;
    });
  }
  const following = input[outputIndex + 1];
  const deliveredMarker = output.output === marker && evidence.imageCount === 0 || Array.isArray(output.output)
    && output.output.length === evidence.imageCount + 1
    && piRecord(output.output[0], 'provider-delivery-marker').type === 'input_text'
    && piRecord(output.output[0], 'provider-delivery-marker').text === marker
    && output.output.slice(1).every(part => {
      const image = piRecord(part, 'provider-delivery-image');
      return image.type === 'input_image' && typeof image.image_url === 'string'
        && image.image_url.startsWith('data:image/');
    });
  if (deliveredMarker && following?.role === 'user' && Array.isArray(following.content)
    && following.content.length === 1 && piRecord(following.content[0], 'provider-delivery-content').type === 'input_text'
    && piRecord(following.content[0], 'provider-delivery-content').text === evidence.text) {
    return removedResizeHints ? { ...payload, input } : payloadInput;
  }
  const parts = Array.isArray(output.output) ? output.output.map(item => piRecord(item, 'provider-output-part')) : undefined;
  const currentText = parts === undefined ? piText(output.output, 'provider-output-text')
    : parts.filter(item => item.type === 'input_text').map(item => piText(item.text, 'provider-output-text')).join('\n');
  const images = parts === undefined ? [] : parts.filter(item => item.type === 'input_image');
  // The session keeps only the marker, so every later turn (reasoning, a reply, another call) needs the exact text again.
  const pendingDelivery = deliveredMarker && (following === undefined || following.role !== 'user');
  if ((currentText !== evidence.text && !pendingDelivery) || images.length !== evidence.imageCount
    || images.some(image => typeof image.image_url !== 'string' || !image.image_url.startsWith('data:image/'))) {
    // Name the mismatch without echoing evidence content: lengths, counts and the leftover non-evidence text.
    const extra = currentText.startsWith(evidence.text) ? currentText.slice(evidence.text.length, evidence.text.length + 300) : '';
    throw new PiReviewerError('provider-evidence-drift', { reason: `text ${currentText === evidence.text ? 'equal' : `${currentText.length} vs ${evidence.text.length}`}`
      + `, images ${images.length} vs ${evidence.imageCount}, pending ${pendingDelivery}${extra ? `, trailing ${JSON.stringify(extra)}` : ''}` });
  }
  const boundedOutput = parts === undefined ? marker : [{ type: 'input_text', text: marker }, ...images];
  const delivered = { role: 'user', content: [{ type: 'input_text', text: evidence.text }] };
  const next = [...input.slice(0, outputIndex), { ...output, output: boundedOutput }, delivered, ...input.slice(outputIndex + 1)];
  return { ...payload, input: next };
}

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
      if (evidence.priorRenders !== undefined && packet.schema !== FIRST_RENDER_REVIEW_TRANSPORT) {
        throw new PiReviewerError('opaque-prior-renders');
      }
      if (evidence.previousIterationRenders !== undefined && packet.schema !== FIRST_RENDER_REVIEW_TRANSPORT) {
        throw new PiReviewerError('opaque-previous-iteration-renders');
      }
      content = [];
      const projected: Record<string, unknown> = { ...evidence };
      if (evidence.feedbackRenders !== undefined && packet.schema !== FIRST_RENDER_REVIEW_TRANSPORT)
        throw new PiReviewerError('opaque-feedback-renders');
      if (evidence.consultedReferenceRenders !== undefined && packet.schema !== FIRST_RENDER_REVIEW_TRANSPORT)
        throw new PiReviewerError('opaque-consulted-reference-renders');
      if ((evidence.designerCaseRenders !== undefined || evidence.designerCases !== undefined)
        && packet.schema !== FIRST_RENDER_REVIEW_TRANSPORT) throw new PiReviewerError('opaque-designer-case-renders');
      if (evidence.motionRenders !== undefined && packet.schema !== FIRST_RENDER_REVIEW_TRANSPORT)
        throw new PiReviewerError('opaque-motion-renders');
      if (evidence.pageIdeas !== undefined && packet.schema !== FIRST_RENDER_REVIEW_TRANSPORT)
        throw new PiReviewerError('opaque-page-ideas');
      for (const field of ['renders', 'referenceRenders', 'priorRenders', 'previousIterationRenders',
        'feedbackRenders', 'consultedReferenceRenders', 'designerCaseRenders', 'motionRenders', 'pageIdeas', 'temporalRenders']) {
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
  let delivery: ProviderEvidence | undefined;
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
      const result = await consumePiReviewerEvidence(config, signal);
      delivery = piReviewerProviderEvidence(result);
      if (['chatgpt-subscription', 'openai-codex'].includes(config.provider)) {
        return { ...result, content: [{ type: 'text', text: providerDeliveryMarker(delivery) },
          ...result.content.filter(item => item.type === 'image')] };
      }
      return result;
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
  pi.on('before_provider_request', (event, context) => {
    if (delivery === undefined || !['chatgpt-subscription', 'openai-codex'].includes(context.model?.provider ?? '')) {
      emit({ type: 'omd_reviewer_provider_request', imageCount: imageCount(event.payload) });
      return;
    }
    const payload = deliverPiReviewerProviderEvidence(event.payload, delivery);
    emit({ type: 'omd_reviewer_provider_request', imageCount: imageCount(payload),
      packetSha256: delivery.packetSha256, textSha256: delivery.textSha256, textBytes: delivery.textBytes });
    return payload;
  });
}
